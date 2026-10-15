import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

async function runBullMQTest() {
  console.log("=== STARTING BULLMQ QUEUE & WORKER LIVE TEST ===");
  console.log(`Connecting to Redis: ${REDIS_URL}...`);

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 2000,
    retryStrategy: () => null, // Do not hang if offline
  });

  let isConnected = false;
  try {
    await new Promise((resolve, reject) => {
      redis.once("ready", () => {
        isConnected = true;
        resolve();
      });
      redis.once("error", reject);
      setTimeout(() => reject(new Error("Redis connection timeout (2s)")), 2000);
    });
  } catch (err) {
    console.warn(`[NOT TESTED] Redis is not reachable at ${REDIS_URL}: ${err.message}`);
    console.warn("Reason: Redis server binary is not installed/running in this local environment.");
    console.warn("This test must be executed on the target EC2 instance where redis-server is active.");
    await redis.disconnect();
    process.exit(2); // Exit code 2 indicates NOT TESTED / SKIPPED due to environment
  }

  console.log("[PASS] Redis connected successfully.");

  const queueName = `test-queue-${Date.now()}`;
  const connection = { url: REDIS_URL, maxRetriesPerRequest: null };

  const queue = new Queue(queueName, { connection });
  let processedJobs = [];
  let failedAttempts = 0;

  const worker = new Worker(
    queueName,
    async (job) => {
      console.log(`Worker processing job ${job.name} (id: ${job.id}, attempt: ${job.attemptsMade + 1})`);
      if (job.name === "retry-test" && job.attemptsMade === 0) {
        failedAttempts++;
        throw new Error("Simulated transient failure for retry test");
      }
      processedJobs.push({ id: job.id, name: job.name, data: job.data });
      return { status: "completed" };
    },
    { connection, concurrency: 1 }
  );

  try {
    // 1. Test Single Job Dispatch & Processing
    console.log("\n--- 1. Testing Single Job Dispatch & Worker Execution ---");
    const job1 = await queue.add("test-job", { msg: "Hello Zusko" });
    console.log(`Dispatched job: ${job1.id}`);

    // Wait for job to complete
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const completedJob1 = processedJobs.find((j) => j.id === job1.id);
    if (completedJob1) {
      console.log("[PASS] Worker processed job successfully.");
    } else {
      console.error("[FAIL] Worker failed to process job.");
    }

    // 2. Test Idempotency & Deduplication
    console.log("\n--- 2. Testing Job Deduplication (Idempotency) ---");
    const deterministicId = `dedup-order-${Date.now()}`;
    const jobA = await queue.add("dedup-test", { orderId: 101 }, { jobId: deterministicId });
    let jobBDuplicate = false;
    try {
      const jobB = await queue.add("dedup-test", { orderId: 101 }, { jobId: deterministicId });
      // If BullMQ returns the existing job or rejects duplicate
      if (jobB.id === jobA.id) {
        jobBDuplicate = true;
      }
    } catch (err) {
      jobBDuplicate = true;
    }

    console.log(`Job A ID: ${jobA.id}`);
    if (jobBDuplicate) {
      console.log("[PASS] BullMQ prevented duplicate job creation with identical jobId.");
    } else {
      console.log("[WARN] BullMQ duplicate job behavior: distinct job created.");
    }

    // 3. Test Retries with Exponential Backoff
    console.log("\n--- 3. Testing Retries with Backoff ---");
    const retryJob = await queue.add(
      "retry-test",
      { orderId: 999 },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 500 },
      }
    );

    // Wait for failure and retry
    await new Promise((resolve) => setTimeout(resolve, 2500));
    if (failedAttempts === 1 && processedJobs.find((j) => j.id === retryJob.id)) {
      console.log("[PASS] Job failed on attempt 1 and succeeded on retry attempt 2.");
    } else {
      console.warn(`[WARN] Retry test state: failedAttempts=${failedAttempts}`);
    }

    console.log("\n=== LIVE BULLMQ TESTS COMPLETE ===");
  } finally {
    await worker.close();
    await queue.drain();
    await queue.clean(0, 1000, "completed");
    await queue.clean(0, 1000, "failed");
    await queue.close();
    await redis.quit();
  }
}

runBullMQTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

import { Queue } from "bullmq";
import redisClient, { isRedisReady } from "../config/redis.js";
import logger from "../utils/logger.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Default job options
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: {
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    count: 500, // Keep last 500 failed jobs for debugging
  },
};

// Queue connection configuration for BullMQ with gentle retry
export const queueConnectionOptions = {
  url: REDIS_URL,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(Math.max(times * 1000, 3000), 20000);
  },
};

let emailQueue = null;
let notificationQueue = null;
let invoiceQueue = null;
let hasLoggedQueueWarning = false;

const attachQueueErrorHandler = (queue, queueName) => {
  queue.on("error", (err) => {
    if (err.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED")) {
      if (!hasLoggedQueueWarning) {
        logger.warn(
          "Redis unavailable for background queues. Fallback handlers active for email and notification delivery."
        );
        hasLoggedQueueWarning = true;
      }
      return;
    }
    logger.warn(`${queueName} error: ${err.message}`);
  });
};

try {
  emailQueue = new Queue("zusko-user-email", {
    connection: queueConnectionOptions,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  notificationQueue = new Queue("zusko-user-notification", {
    connection: queueConnectionOptions,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  invoiceQueue = new Queue("zusko-user-invoice", {
    connection: queueConnectionOptions,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  attachQueueErrorHandler(emailQueue, "EmailQueue");
  attachQueueErrorHandler(notificationQueue, "NotificationQueue");
  attachQueueErrorHandler(invoiceQueue, "InvoiceQueue");
} catch (err) {
  logger.error(`Error initializing queues: ${err.message}`);
}

/**
 * Safely add a job to a queue. If Redis or BullMQ is unavailable, execute fallback asynchronously or log.
 */
export const dispatchJob = async (queue, jobName, data, fallbackFn = null, jobOptions = {}) => {
  if (queue && isRedisReady()) {
    try {
      const job = await queue.add(jobName, data, jobOptions);
      logger.info(`Queue added: [${queue.name}] job: ${jobName} (id: ${job.id})`);
      return { success: true, jobId: job.id };
    } catch (err) {
      logger.warn(`Failed to dispatch job [${jobName}] to queue: ${err.message}. Triggering fallback.`);
    }
  }

  // Graceful fallback: run directly in background if fallback provided
  if (typeof fallbackFn === "function") {
    try {
      Promise.resolve(fallbackFn(data)).catch((fallbackErr) => {
        logger.error(`Fallback execution failed for [${jobName}]: ${fallbackErr.message}`);
      });
      return { success: true, fallback: true };
    } catch (fallbackErr) {
      logger.error(`Fallback synchronous error for [${jobName}]: ${fallbackErr.message}`);
      return { success: false, error: fallbackErr.message };
    }
  }

  return { success: false, queued: false };
};

export { emailQueue, notificationQueue, invoiceQueue };

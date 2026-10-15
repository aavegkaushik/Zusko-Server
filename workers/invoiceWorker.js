import { Worker } from "bullmq";
import { queueConnectionOptions } from "../queues/queueManager.js";
import logger from "../utils/logger.js";

export const createInvoiceWorker = () => {
  const worker = new Worker(
    "zusko-user-invoice",
    async (job) => {
      logger.info(`Processing invoice job: ${job.name} (id: ${job.id})`);

      if (job.name === "generate-order-invoice") {
        const { orderId } = job.data;
        logger.info(`Invoice generation queued for order: ${orderId}`);
        // Placeholder / ready for invoice PDF generation when enabled
      }
    },
    {
      connection: queueConnectionOptions,
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Queue completed: [zusko-user-invoice] job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Queue failed: [zusko-user-invoice] job ${job?.id}: ${err.message}`);
  });

  worker.on("error", (err) => {
    // Suppress repeated connection noise if Redis is down
  });

  return worker;
};

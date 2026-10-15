import { Worker } from "bullmq";
import { queueConnectionOptions } from "../queues/queueManager.js";
import { sendTelegramAlert } from "../services/telegramService.js";
import logger from "../utils/logger.js";

export const createNotificationWorker = () => {
  const worker = new Worker(
    "zusko-user-notification",
    async (job) => {
      logger.info(`Processing notification job: ${job.name} (id: ${job.id})`);

      if (job.name === "send-telegram-order-alert") {
        const { order } = job.data;
        if (!order) {
          logger.warn(`Skipping notification job ${job.id}: missing order data`);
          return;
        }

        await sendTelegramAlert(order);
        logger.info(`Queue completed: [zusko-user-notification] sent telegram alert for order ${order.orderId}`);
      }
    },
    {
      connection: queueConnectionOptions,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Queue completed: [zusko-user-notification] job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Queue failed: [zusko-user-notification] job ${job?.id}: ${err.message}`);
  });

  worker.on("error", (err) => {
    // Suppress repeated connection noise if Redis is down
  });

  return worker;
};

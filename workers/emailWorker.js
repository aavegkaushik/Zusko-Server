import { Worker } from "bullmq";
import { queueConnectionOptions } from "../queues/queueManager.js";
import { sendEmail } from "../utils/sendEmail.js";
import { generateOrderPlacedEmail } from "../utils/orderEmails.js";
import logger from "../utils/logger.js";

export const createEmailWorker = () => {
  const worker = new Worker(
    "zusko-user-email",
    async (job) => {
      logger.info(`Processing email job: ${job.name} (id: ${job.id})`);

      if (job.name === "send-order-placed-email") {
        const { order } = job.data;
        if (!order || !order.customerEmail) {
          logger.warn(`Skipping email job ${job.id}: missing customer email`);
          return;
        }

        await sendEmail({
          to: order.customerEmail,
          from: process.env.ORDER_MAIL || process.env.MAIL_FROM,
          subject: `Your Zusko Order #${order.orderId} is Confirmed 🎉`,
          html: generateOrderPlacedEmail(order),
        });

        logger.info(`Queue completed: [zusko-user-email] sent order email to ${order.customerEmail}`);
      } else if (job.name === "send-custom-email") {
        const { to, subject, html, from } = job.data;
        await sendEmail({ to, subject, html, from });
        logger.info(`Queue completed: [zusko-user-email] sent custom email to ${to}`);
      }
    },
    {
      connection: queueConnectionOptions,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Queue completed: [zusko-user-email] job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Queue failed: [zusko-user-email] job ${job?.id}: ${err.message}`);
  });

  worker.on("error", (err) => {
    // Suppress repeated connection noise if Redis is down
  });

  return worker;
};

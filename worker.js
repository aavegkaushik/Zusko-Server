import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { createEmailWorker } from "./workers/emailWorker.js";
import { createNotificationWorker } from "./workers/notificationWorker.js";
import { createInvoiceWorker } from "./workers/invoiceWorker.js";
import logger from "./utils/logger.js";

dotenv.config();

logger.info("Worker process starting...");

async function startWorker() {
  try {
    await connectDB();
    logger.info("Worker MongoDB connected");

    const emailWorker = createEmailWorker();
    const notificationWorker = createNotificationWorker();
    const invoiceWorker = createInvoiceWorker();

    logger.info("Worker started: zusko-user-worker is active");

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down worker...`);
      try {
        await Promise.all([
          emailWorker.close(),
          notificationWorker.close(),
          invoiceWorker.close(),
        ]);
        logger.info("Worker stopped: All queues closed cleanly");
        process.exit(0);
      } catch (err) {
        logger.error(`Error during worker shutdown: ${err.message}`);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error(`Failed to start worker: ${error.message}`);
    process.exit(1);
  }
}

startWorker();

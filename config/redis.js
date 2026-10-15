import Redis from "ioredis";
import logger from "../utils/logger.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisClient = null;
let isRedisConnected = false;
let hasLoggedOfflineWarning = false;

try {
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      // Gentle reconnect strategy: wait between 3s and 20s to prevent aggressive CPU/log loops
      return Math.min(Math.max(times * 1000, 3000), 20000);
    },
    reconnectOnError(err) {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
    lazyConnect: false,
  });

  redisClient.on("connect", () => {
    // Connection established
  });

  redisClient.on("ready", () => {
    isRedisConnected = true;
    hasLoggedOfflineWarning = false;
    logger.info("Redis ready for operations");
  });

  redisClient.on("error", (err) => {
    isRedisConnected = false;
    if (err.code === "ECONNREFUSED" || err.message.includes("ECONNREFUSED")) {
      // Log single informative warning instead of spamming on every retry tick
      if (!hasLoggedOfflineWarning) {
        logger.warn(
          `Redis is not running on ${REDIS_URL}. Running in graceful fallback mode (MongoDB Atlas source of truth).`
        );
        hasLoggedOfflineWarning = true;
      }
      return;
    }
    logger.warn(`Redis connection error: ${err.message}`);
  });

  redisClient.on("close", () => {
    isRedisConnected = false;
  });
} catch (error) {
  logger.error(`Failed to initialize Redis client: ${error.message}`);
  redisClient = null;
  isRedisConnected = false;
}

export const getRedisClient = () => redisClient;
export const isRedisReady = () => isRedisConnected && redisClient?.status === "ready";

export default redisClient;

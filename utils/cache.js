import redisClient, { isRedisReady } from "../config/redis.js";
import logger from "./logger.js";

/**
 * Get cached data by key.
 * Returns parsed object or string, or null if key does not exist or Redis is offline.
 */
export const getCache = async (key) => {
  if (!isRedisReady() || !redisClient) {
    return null;
  }

  try {
    const data = await redisClient.get(key);
    if (data !== null) {
      logger.info(`Cache HIT: ${key}`);
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    logger.info(`Cache MISS: ${key}`);
    return null;
  } catch (error) {
    logger.warn(`Cache GET error for key ${key}: ${error.message}`);
    return null;
  }
};

/**
 * Set cache key with optional TTL (in seconds).
 */
export const setCache = async (key, value, ttlSeconds = 300) => {
  if (!isRedisReady() || !redisClient) {
    return false;
  }

  try {
    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (ttlSeconds && Number(ttlSeconds) > 0) {
      await redisClient.set(key, stringValue, "EX", Number(ttlSeconds));
    } else {
      await redisClient.set(key, stringValue);
    }
    return true;
  } catch (error) {
    logger.warn(`Cache SET error for key ${key}: ${error.message}`);
    return false;
  }
};

/**
 * Delete a single cache key.
 */
export const delCache = async (key) => {
  if (!isRedisReady() || !redisClient) {
    return false;
  }

  try {
    await redisClient.del(key);
    logger.info(`Cache DEL: ${key}`);
    return true;
  } catch (error) {
    logger.warn(`Cache DEL error for key ${key}: ${error.message}`);
    return false;
  }
};

/**
 * Delete all keys matching a pattern (e.g. `coupons:available:*`)
 */
export const delCachePattern = async (pattern) => {
  if (!isRedisReady() || !redisClient) {
    return false;
  }

  try {
    const stream = redisClient.scanStream({
      match: pattern,
      count: 100,
    });

    const keysToDelete = [];
    for await (const resultKeys of stream) {
      if (resultKeys.length) {
        keysToDelete.push(...resultKeys);
      }
    }

    if (keysToDelete.length > 0) {
      await redisClient.del(...keysToDelete);
      logger.info(`Cache DEL pattern ${pattern} matched ${keysToDelete.length} keys`);
    }
    return true;
  } catch (error) {
    logger.warn(`Cache DEL pattern error for ${pattern}: ${error.message}`);
    return false;
  }
};

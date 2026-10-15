import redisClient, { isRedisReady } from "../config/redis.js";
import logger from "../utils/logger.js";

// In-memory fallback map for when Redis is unavailable
const memoryFallbackStore = new Map();

// Periodic cleanup for memory store
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryFallbackStore.entries()) {
    if (record.resetTime <= now) {
      memoryFallbackStore.delete(key);
    }
  }
}, 60000);

/**
 * Creates a rate limiter middleware backed by Redis, with in-memory fallback.
 * @param {Object} options
 * @param {string} options.prefix - Redis key prefix
 * @param {number} options.windowSeconds - Window duration in seconds
 * @param {number} options.max - Maximum allowed requests in window
 * @param {string} options.message - Error message returned on 429
 * @param {Function} [options.keyGenerator] - Custom key extraction from req
 */
export const createRedisRateLimiter = ({
  prefix = "ratelimit",
  windowSeconds = 60,
  max = 60,
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.ip || "global",
}) => {
  return async (req, res, next) => {
    try {
      const identifier = keyGenerator(req);
      const key = `${prefix}:${identifier}`;

      if (isRedisReady() && redisClient) {
        // Atomic pipeline: INCR and EXPIRE if new
        const multi = redisClient.multi();
        multi.incr(key);
        multi.ttl(key);
        const results = await multi.exec();

        const count = results[0][1];
        const ttl = results[1][1];

        // If key has no TTL (first increment), set expiry
        if (ttl === -1) {
          await redisClient.expire(key, windowSeconds);
        }

        res.setHeader("X-RateLimit-Limit", max);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));

        if (count > max) {
          logger.warn(`Rate limit exceeded for ${key}: ${count}/${max}`);
          return res.status(429).json({
            success: false,
            message,
          });
        }

        return next();
      }

      // Fallback: In-memory store
      const now = Date.now();
      const existing = memoryFallbackStore.get(key);

      if (!existing || existing.resetTime <= now) {
        memoryFallbackStore.set(key, {
          count: 1,
          resetTime: now + windowSeconds * 1000,
        });
        return next();
      }

      existing.count += 1;
      if (existing.count > max) {
        logger.warn(`Rate limit (memory fallback) exceeded for ${key}: ${existing.count}/${max}`);
        return res.status(429).json({
          success: false,
          message,
        });
      }

      return next();
    } catch (err) {
      logger.warn(`Rate limiter error (${prefix}): ${err.message}. Permitting request.`);
      return next();
    }
  };
};

// Pre-configured rate limiters for customer abuse-prone endpoints:
export const otpSendLimiter = createRedisRateLimiter({
  prefix: "rl:otp:send",
  windowSeconds: 10 * 60, // 10 minutes
  max: 5, // 5 requests per 10 mins
  message: "Too many OTP requests. Please wait a few minutes before trying again.",
  keyGenerator: (req) => {
    const email = (req.body?.email || "").toLowerCase().trim();
    const ip = req.ip || "ip";
    return email ? `email:${email}` : `ip:${ip}`;
  },
});

export const authLoginLimiter = createRedisRateLimiter({
  prefix: "rl:auth:login",
  windowSeconds: 10 * 60, // 10 minutes
  max: 10, // 10 requests per 10 mins
  message: "Too many login attempts. Please try again after 10 minutes.",
  keyGenerator: (req) => {
    const email = (req.body?.email || "").toLowerCase().trim();
    const ip = req.ip || "ip";
    return email ? `email:${email}` : `ip:${ip}`;
  },
});

export const paymentLimiter = createRedisRateLimiter({
  prefix: "rl:payment",
  windowSeconds: 60, // 1 minute
  max: 20, // 20 requests per minute
  message: "Payment request limit reached. Please wait a moment before trying again.",
  keyGenerator: (req) => req.user?._id?.toString() || req.ip || "user",
});

import rateLimit from "express-rate-limit";

const parseEnvInt = (val, defaultVal) => {
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
};

// General API Rate Limiter
// Scaled for production traffic with burst headroom
export const generalLimiter = rateLimit({
  windowMs: parseEnvInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 mins default
  max: parseEnvInt(process.env.RATE_LIMIT_MAX, 1000), // 1000 requests per 15 min per IP default
  message: {
    success: false,
    message: "Too many requests from this network. Please try again in a few moments.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Never rate-limit monitoring, health probes, or CORS preflights
  skip: (req) => {
    const path = req.path || req.originalUrl || "";
    return (
      req.method === "OPTIONS" ||
      path === "/health" ||
      path === "/api/health" ||
      path === "/version" ||
      path.endsWith("/health")
    );
  },
});

// Authentication IP-level rate limiter
// Secondary line of defense behind redisRateLimiter (which tracks per-email/IP)
export const authLimiter = rateLimit({
  windowMs: parseEnvInt(process.env.AUTH_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parseEnvInt(process.env.AUTH_LIMIT_MAX, 25), // 25 attempts per 15 minutes per IP
  message: {
    success: false,
    message: "Too many authentication attempts from this IP. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
});

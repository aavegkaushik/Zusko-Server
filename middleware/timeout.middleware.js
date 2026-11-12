import logger from "../utils/logger.js";

/**
 * Middleware that sets a hard execution timeout on incoming HTTP requests.
 * Prevents requests from hanging indefinitely under heavy load and exhausting sockets/memory.
 */
export const requestTimeoutMiddleware = (timeoutMs = 30000) => {
  const configuredTimeout = process.env.REQUEST_TIMEOUT_MS
    ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
    : timeoutMs;

  return (req, res, next) => {
    // Skip timeout for streaming or upload endpoints if needed, or allow higher limit
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(`Request timed out after ${configuredTimeout}ms`, {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
        });

        res.status(503).json({
          success: false,
          code: "REQUEST_TIMEOUT",
          message: "Request timed out. The server is under heavy load. Please try again.",
        });
      }
    }, configuredTimeout);

    // Unref so this timer does not prevent process termination
    if (timer.unref) {
      timer.unref();
    }

    const cleanup = () => {
      clearTimeout(timer);
    };

    res.on("finish", cleanup);
    res.on("close", cleanup);

    next();
  };
};

export default requestTimeoutMiddleware;


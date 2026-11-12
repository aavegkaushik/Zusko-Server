import logger from "../utils/logger.js";

const errorHandler = (err, req, res, next) => {
  // If headers already sent, delegate to default Express error handler to prevent ERR_HTTP_HEADERS_SENT crash
  if (res.headersSent) {
    return next(err);
  }

  logger.error("Unhandled Error", {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  // Handle malformed JSON body parser error
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON payload provided.",
    });
  }

  // Handle payload too large (413)
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      success: false,
      message: "Request payload size exceeds permitted limits.",
    });
  }

  // Handle Mongoose Validation Error (400)
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.length > 0 ? messages.join(", ") : "Validation failed",
    });
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid format for field: ${err.path || "identifier"}`,
    });
  }

  // Handle MongoDB Duplicate Key Error (409)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "record";
    return res.status(409).json({
      success: false,
      message: `Duplicate entry: A record with this ${field} already exists.`,
    });
  }

  // Handle JWT Errors (401)
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authorization token.",
    });
  }

  // Handle Timeout Errors
  if (err.code === "ETIMEDOUT" || err.code === "EXTERNAL_SERVICE_TIMEOUT") {
    return res.status(504).json({
      success: false,
      message: "Upstream service timed out. Please try again.",
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === "production";

  // Prevent leaking internal stack/driver details in production 500 responses
  const clientMessage =
    statusCode === 500 && isProduction
      ? "An unexpected internal server error occurred. Please try again later."
      : err.message || "Server Error";

  return res.status(statusCode).json({
    success: false,
    message: clientMessage,
  });
};

export default errorHandler;

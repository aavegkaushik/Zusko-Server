import logger from "../utils/logger.js";

const errorHandler = (err, req, res, next) => {
  logger.error("Unhandled Error", {
    url: req.originalUrl,
    method: req.method,
    message: err.message,
    stack: err.stack
  });

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Server Error"
  });
};

export default errorHandler;
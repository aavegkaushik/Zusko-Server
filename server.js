import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import hpp from "hpp";
import compression from "compression";
import mongoose from "mongoose";

import connectDB, { isDBConnected } from "./config/db.js";
import { isRedisReady, getRedisClient } from "./config/redis.js";
import logger from "./utils/logger.js";

import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoute from "./routes/payment.routes.js";
import userRoutes from "./routes/userRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import securityRoutes from "./routes/securityRoutes.js";
import careerRoutes from "./routes/career.routes.js";
import businessLeadRoutes from "./routes/businessLead.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import pricingRoutes from "./routes/pricing.routes.js";

import { generalLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/error.middleware.js";
import requestTimeoutMiddleware from "./middleware/timeout.middleware.js";
import { protect, verifyAdmin } from "./middleware/auth.middleware.js";
import { createCoupon } from "./controllers/coupon.controller.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configure secure reverse proxy trust for local Nginx topology (127.0.0.1 / ::1)
app.set("trust proxy", process.env.TRUST_PROXY || "loopback");

// Request timeout middleware: terminates hanging connections under high concurrency
app.use(requestTimeoutMiddleware(30000));

// Security & Parsing Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://zusko.in",
      "https://www.zusko.in",
    ],
    credentials: true,
  })
);
app.use(helmet());
app.use(hpp());

// HTTP Response Compression
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024,
  })
);

// Body Parsing with memory exhaustion protection
const maxBodySize = process.env.MAX_BODY_SIZE || "2mb";
app.use(
  express.json({
    limit: maxBodySize,
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: maxBodySize,
  })
);

// Version Check
app.use("/version", (req, res) => {
  res.send("Version June 26");
});

// Resilient Health Check Endpoints (Non-blocking O(1) checks)
const healthHandler = (req, res) => {
  const dbStatus = isDBConnected() ? "connected" : "disconnected";
  const redisStatus = isRedisReady() ? "connected" : "disconnected";
  const mem = process.memoryUsage();

  res.status(200).json({
    status: isDBConnected() ? "healthy" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    pid: process.pid,
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  });
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Customer API Routes
app.use("/api", generalLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoute);
app.use("/api/addresses", addressRoutes);
app.use("/api/careers", careerRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/business-leads", businessLeadRoutes);

// Root Admin Route
app.post("/", protect, verifyAdmin, createCoupon);

// Central Error Handling Middleware
app.use(errorHandler);

// HTTP Server and Process Lifecycle Management
let server = null;
let isShuttingDown = false;

const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [PID: ${process.pid}]`);
      // Zero-downtime cluster ready signal to PM2
      if (process.send) {
        process.send("ready");
      }
    });

    // Production socket timeouts: prevent 502s behind reverse proxies & slowloris attacks
    server.keepAliveTimeout = 65000; // 65s (exceeds proxy keep-alive)
    server.headersTimeout = 66000; // 66s (exceeds keepAliveTimeout)
    server.requestTimeout = 30000; // 30s request socket timeout
  } catch (err) {
    logger.error(`Database connection failed on startup: ${err.message}`);
    process.exit(1);
  }
};

// Graceful Shutdown to drain in-flight requests without dropping customer orders
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timeout exceeded (15s). Forcing process exit.");
    process.exit(1);
  }, 15000);
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      logger.info("HTTP server closed to new connections.");
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close(false);
      logger.info("MongoDB connection closed cleanly.");
    }

    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      await redis.quit();
      logger.info("Redis client disconnected cleanly.");
    }

    logger.info("Graceful shutdown completed successfully.");
    process.exit(0);
  } catch (err) {
    logger.error(`Error during graceful shutdown: ${err.message}`);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Global Process Crash Immunity Handlers
process.on("uncaughtException", (err) => {
  logger.error("FATAL: Uncaught Exception caught at process level:", {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  // Gracefully drain and exit so PM2 cluster restarts the worker cleanly
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection caught at process level:", {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Do NOT terminate process on unhandled rejection: protect all active requests
});

startServer();

export default app;

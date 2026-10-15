import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import hpp from "hpp";
import compression from "compression";

import connectDB, { isDBConnected } from "./config/db.js";
import { isRedisReady } from "./config/redis.js";
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
import { protect, verifyAdmin } from "./middleware/auth.middleware.js";
import { createCoupon } from "./controllers/coupon.controller.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configure secure reverse proxy trust for local Nginx topology (127.0.0.1 / ::1)
app.set("trust proxy", process.env.TRUST_PROXY || "loopback");

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

app.use(express.json());

// Version Check
app.use("/version", (req, res) => {
  res.send("Version June 26");
});

// Lightweight Health Check Endpoints
const healthHandler = (req, res) => {
  const dbStatus = isDBConnected() ? "connected" : "disconnected";
  const redisStatus = isRedisReady() ? "connected" : "disconnected";

  res.status(200).json({
    status: "healthy",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
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

// Start Server after connecting to MongoDB
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error(`Database connection failed on startup: ${err.message}`);
    process.exit(1);
  });

export default app;
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import dotenv from "dotenv";

dotenv.config();

let isConnected = false;

const parseEnvInt = (val, defaultVal) => {
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
};

export const connectDB = async (retries = 5, retryDelayMs = 2000) => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  const options = {
    maxPoolSize: parseEnvInt(process.env.MONGO_MAX_POOL_SIZE, 100), // Scaled to 100 for high concurrency
    minPoolSize: parseEnvInt(process.env.MONGO_MIN_POOL_SIZE, 10), // Pre-warmed connections to absorb traffic spikes
    maxIdleTimeMS: 30000, // Reclaim connections idle for 30s
    waitQueueTimeoutMS: 10000, // Fail fast after 10s queue wait instead of hanging indefinitely
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // IPv4
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(mongoUri, options);
      isConnected = true;
      logger.info(`MongoDB connected: ${conn.connection.host} (pool: ${options.minPoolSize}-${options.maxPoolSize})`);
      return conn.connection || mongoose.connection;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

// CRITICAL: Prevent unhandled EventEmitter 'error' crash
mongoose.connection.on("error", (err) => {
  isConnected = false;
  logger.error(`MongoDB runtime connection error: ${err.message}`);
});

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  logger.warn("MongoDB disconnected. Mongoose will attempt automatic reconnection.");
});

mongoose.connection.on("reconnected", () => {
  isConnected = true;
  logger.info("MongoDB reconnected successfully.");
});

export const isDBConnected = () => isConnected && mongoose.connection.readyState === 1;

export default connectDB;

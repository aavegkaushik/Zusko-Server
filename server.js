import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoute from './routes/payment.routes.js'
import userRoutes from './routes/userRoutes.js'
import addressRoutes from './routes/addressRoutes.js'
import securityRoutes from "./routes/securityRoutes.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/error.middleware.js";
import helmet from "helmet";
import hpp from "hpp";
import xssClean from 'xss-clean'
dotenv.config();

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "https://zusko.in"],
  credentials: true
}));
app.use(helmet());
app.use(xssClean());
app.use(hpp());
app.use(express.json());
app.use("/api/health", (req, res) => {
  res.send("API is running.")
  res.status(200).json({ message: "API is running" });
})
app.use(errorHandler);
app.use("/api", generalLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoute);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/security", securityRoutes);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(5000, () => console.log("Server running on port 5000"));
  })
  .catch((err) => console.log(err));
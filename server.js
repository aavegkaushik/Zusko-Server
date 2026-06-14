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
import careerRoutes from "./routes/career.routes.js";
import helmet from "helmet";
import hpp from "hpp";
dotenv.config();

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174",  "https://zusko.in", "https://www.zusko.in"],
  credentials: true
}));
app.use(helmet());
app.use(hpp());
app.use(express.json());
app.use("/version", (req, res) => {
  res.send("Version June 14");
});
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
app.use("/api/careers", careerRoutes);
app.use("/api/security", securityRoutes);
app.use(errorHandler);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(5000, () => console.log("Server running on port 5000"));
  })
  .catch((err) => console.log(err));
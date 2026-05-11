import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoute from './routes/payment.routes.js'
dotenv.config();

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "https://zusko.in"],
  credentials: true
}));
app.use(express.json());
app.use("/api/health", (req, res) => {
  res.send("API is running.")
  res.status(200).json({ message: "API is running" });
})
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoute);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(5000, () => console.log("Server running on port 5000"));
  })
  .catch((err) => console.log(err));
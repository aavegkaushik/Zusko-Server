import express from "express";
import {
  getActiveOrders,
  getOrderHistory,
  getOrderTracking,
  cancelOrder,
  rateOrder,
  createOrder,
} from "../controllers/order.controller.js";

import {protect} from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/active", protect, getActiveOrders);

router.get("/history", protect, getOrderHistory);

router.get("/:id", protect, getOrderTracking);

router.patch("/:id/cancel", protect, cancelOrder);

router.post("/:id/rate", protect, rateOrder);

router.post("/create", protect, createOrder);

export default router;
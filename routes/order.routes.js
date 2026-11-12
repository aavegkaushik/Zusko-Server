import express from "express";
import {
  getActiveOrders,
  getOrderHistory,
  getOrderTracking,
  cancelOrder,
  cancelOrderByCompany,
  updateOrderStatus,
  rateOrder,
  createOrder,
  getDeliveryEstimate,
} from "../controllers/order.controller.js";

import { protect, verifyAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// Customer Order Retrieval
router.get("/active", protect, getActiveOrders);
router.get("/history", protect, getOrderHistory);

// Order Placement & Estimations
router.post("/delivery-estimate", protect, getDeliveryEstimate);
router.post("/create", protect, createOrder);

// Single Order Operations
router.get("/:id", protect, getOrderTracking);
router.get("/:id/tracking", protect, getOrderTracking);
router.patch("/:id/cancel", protect, cancelOrder);
router.post("/:id/rate", protect, rateOrder);

// Admin / Company Specific Order Management
router.patch("/:id/company-cancel", protect, verifyAdmin, cancelOrderByCompany);
router.patch("/:id/admin-cancel", protect, verifyAdmin, cancelOrderByCompany);
router.patch("/:id/status", protect, verifyAdmin, updateOrderStatus);

export default router;

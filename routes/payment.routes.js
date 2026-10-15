import express from "express";
import {
  addPaymentMethod,
  createRazorpayOrder,
  deletePaymentMethod,
  getPaymentMethods,
  payPendingOrder,
  setDefaultPaymentMethod,
  verifyPayment,
  refundPayment,
} from "../controllers/payment.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { paymentLimiter } from "../middleware/redisRateLimiter.js";

const router = express.Router();

router.post("/create-order", protect, paymentLimiter, createRazorpayOrder);

router.post("/verify", protect, verifyPayment);

router.post(
  "/pay-pending",
  protect,
  payPendingOrder
);

router.get("/", protect, getPaymentMethods);

router.post("/", protect, addPaymentMethod);

router.delete("/:id", protect, deletePaymentMethod);

router.patch("/:id/default", protect, setDefaultPaymentMethod);

export default router;
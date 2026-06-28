import express from "express";
import { addPaymentMethod, createRazorpayOrder, deletePaymentMethod, getPaymentMethods, payPendingOrder, setDefaultPaymentMethod, verifyPayment, refundPayment } from "../controllers/payment.controller.js";
const router = express.Router();
import {protect} from "../middleware/auth.middleware.js";

router.post("/create-order", protect, createRazorpayOrder);

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
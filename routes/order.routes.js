import express from "express";
import {protect} from "../middleware/auth.middleware.js"
import {
  createOrder,
  getOrdersByPhone,
  getAllOrders,
  trackOrder,
} from "../controllers/order.controller.js";

const router = express.Router();

router.post("/create", createOrder);
router.get("/phone/:phone", getOrdersByPhone);
router.get("/all", getAllOrders);
router.get("/latest",protect, trackOrder);

export default router;
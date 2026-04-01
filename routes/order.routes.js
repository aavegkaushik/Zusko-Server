import express from "express";
import {protect} from "../middleware/jwt.middleware.js"
import {
  createOrder,
  getOrdersByPhone,
  getAllOrders,
} from "../controllers/order.controller.js";

const router = express.Router();

router.post("/create", createOrder);
router.get("/phone/:phone", getOrdersByPhone);
router.get("/all", getAllOrders);

export default router;
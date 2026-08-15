import express from "express";

import {
  getAvailableCoupons,
  validateCoupon,
} from "../controllers/coupon.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/available",
  protect,
  getAvailableCoupons
);

router.post(
  "/validate",
  protect,
  validateCoupon
);

export default router;
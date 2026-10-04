import express from "express";

import {
  getAvailableCoupons,
  validateCoupon,

  createCoupon,
  getAdminCoupons,
  getAdminCoupon,
  updateCoupon,
  toggleCoupon,
  deleteCoupon,
  getCouponUsage,
  getCouponAnalytics,
} from "../controllers/coupon.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// ============================================================
// USER COUPON ROUTES
// ============================================================

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

// ============================================================
// ADMIN COUPON ROUTES
// ============================================================
//
// NOTE:
// Abhi protect use kiya hai.
// Neeche adminOnly middleware add karna hai
// jab tumhara existing admin role middleware confirm ho.
// ============================================================

router.get(
  "/admin",
  protect,
  getAdminCoupons
);

router.get(
  "/admin/analytics",
  protect,
  getCouponAnalytics
);

router.get(
  "/admin/:id",
  protect,
  getAdminCoupon
);

router.get(
  "/admin/:id/usage",
  protect,
  getCouponUsage
);

router.post(
  "/admin",
  protect,
  createCoupon
);

router.put(
  "/admin/:id",
  protect,
  updateCoupon
);

router.patch(
  "/admin/:id/toggle",
  protect,
  toggleCoupon
);

router.delete(
  "/admin/:id",
  protect,
  deleteCoupon
);

export default router;
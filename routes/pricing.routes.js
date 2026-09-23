import express from "express";
import { getCustomerPricing } from "../controllers/pricing.controller.js";

const router = express.Router();

// ============================================================
// CUSTOMER PRICING
// Public — no authentication required
// ============================================================

router.get("/", getCustomerPricing);

export default router;
import express from "express";
import {
  getProfile,
  updateProfile,
  updateAvatar,
  getDashboardSummary,
} from "../controllers/user.controller.js";

import protect from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/me", protect, getProfile);

router.put("/me", protect, updateProfile);

router.patch("/avatar", protect, updateAvatar);

router.get("/dashboard-summary", protect, getDashboardSummary);

export default router;
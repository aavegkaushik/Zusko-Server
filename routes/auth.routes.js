import express from "express";
import { loginUser, sendOtp } from "../controllers/auth.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { loginValidation, validate } from "../validators/auth.validator.js";

const router = express.Router();

router.post("/login", authLimiter, loginValidation, validate, loginUser);
router.post("/send-otp", sendOtp)
export default router;
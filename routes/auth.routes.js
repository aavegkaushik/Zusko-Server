import express from "express";
import { loginUser, sendOtp } from "../controllers/auth.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { otpSendLimiter, authLoginLimiter } from "../middleware/redisRateLimiter.js";
import { loginValidation, validate } from "../validators/auth.validator.js";

const router = express.Router();

router.post("/login", authLoginLimiter, authLimiter, loginValidation, validate, loginUser);
router.post("/send-otp", otpSendLimiter, sendOtp);

export default router;
import express from "express";
import { loginUser } from "../controllers/auth.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { loginValidation, validate } from "../validators/auth.validator.js";

const router = express.Router();

router.post("/login", authLimiter, loginValidation, validate, loginUser);

export default router;
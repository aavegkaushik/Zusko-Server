import { body, validationResult } from "express-validator";

export const signupValidation = [
  body("name")
    .optional({ checkFalsy: true })
    .trim(),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  body("phone")
    .optional({ checkFalsy: true })
    .trim(),
];

export const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required"),

  body("name")
    .optional({ checkFalsy: true })
    .trim(),

  body("phone")
    .optional({ checkFalsy: true })
    .trim(),
];

export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  next();
};
import { body, validationResult } from "express-validator";

export const signupValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

  body("email")
    .isEmail()
    .withMessage("Invalid email")
    .normalizeEmail(),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 chars"),
];

export const loginValidation = [
  body("email")
    .isEmail()
    .withMessage("Invalid email"),

  body("password")
    .notEmpty()
    .withMessage("Password required"),
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
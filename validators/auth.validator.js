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

  body("phone")
    .isLength({ max: 10 })
    .withMessage("Enter a valid mobile number"),
];

export const loginValidation = [
  body("email")
    .isEmail()
    .withMessage("Invalid email"),

    body("name")
    .notEmpty()
    .withMessage("Name is required"),

  body("phone")
    .notEmpty()
    .withMessage("Phone Number is required"),
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
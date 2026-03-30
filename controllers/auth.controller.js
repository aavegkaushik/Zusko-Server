import User from "../models/user.model.js";
import jwt from "jsonwebtoken";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Register / Login (phone-based)
export const loginUser = async (req, res) => {
  const { name, phone } = req.body;

  let user = await User.findOne({ phone });

  if (!user) {
    user = await User.create({ name, phone });
  }

  res.json({
    user,
    token: generateToken(user._id),
  });
};
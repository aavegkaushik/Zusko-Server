import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import jwt from "jsonwebtoken";
import { UAParser } from "ua-parser-js";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

export const loginUser = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        name: name || "Guest",
        phone,
        email,
      });
    } else {
      if (name) user.name = name;
      if (email) {
  const existingEmailUser = await User.findOne({ email });

  // Only update email if it belongs to the same user
  if (
    !existingEmailUser ||
    existingEmailUser._id.toString() === user._id.toString()
  ) {
    user.email = email;
  }
}

      await user.save();
    }

    const token = generateToken(user._id);

    await Session.create({
      userId: user._id,
      token,
      lastActive: new Date(),
    });

    return res.status(200).json({
      success: true,
      user,
      token,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
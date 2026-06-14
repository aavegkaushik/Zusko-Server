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

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    let user = await User.findOne({
      email: email.toLowerCase(),
    });

    // New User
    if (!user) {
      user = await User.create({
        name: name || "Guest",
        email: email.toLowerCase(),
        phone,
      });
    }

    // Existing User
    else {
      if (name) {
        user.name = name;
      }

      // Update phone if changed
      if (phone && phone !== user.phone) {
        user.phone = phone;
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
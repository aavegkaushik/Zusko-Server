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
        email: email || "",
      });
    } else {
      if (name) user.name = name;
      if (email) user.email = email;

      await user.save();
    }

    const token = generateToken(user._id);

    // Parse device info
    const parser = new UAParser(req.headers["user-agent"]);
    const browser = parser.getBrowser().name || "Unknown Browser";
    const os = parser.getOS().name || "Unknown Device";

    await Session.create({
      userId: user._id,
      token,
      device: os,
      browser,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
      lastActive: new Date(),
    });

    res.status(200).json({
      success: true,
      user,
      token,
    });
  } catch (error) {
    console.error("AUTH ERROR FULL:", error);
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

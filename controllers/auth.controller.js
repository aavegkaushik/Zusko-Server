import User from "../models/user.model.js";
import jwt from "jsonwebtoken";

// 🔐 Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// 📲 Register / Login (phone-based)
export const loginUser = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    // ✅ Validation
    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    // 🔍 Check existing user
    let user = await User.findOne({ phone });

    if (!user) {
      // 🆕 Create new user
      user = await User.create({
        name: name || "Guest",
        phone,
        email: email || "",
      });
    } else {
      // 🔄 Update missing fields (smart update)
      if (name && !user.name) user.name = name;
      if (email && !user.email) user.email = email;

      await user.save();
    }

    // 🔐 Send response with token
    res.status(200).json({
      success: true,
      user,
      token: generateToken(user._id),
    });

  } catch (error) {
    console.error("AUTH ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
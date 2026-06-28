import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import jwt from "jsonwebtoken";
import { UAParser } from "ua-parser-js";
import OTP from "../models/EmailOTP.js";
import { sendEmail } from "../utils/sendEmail.js";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailRegex.test(email)) {
  return res.status(400).json({
    success: false,
    message: "Invalid email address",
  });
}


    if (!email) {
  return res.status(400).json({
    success: false,
    message: "Email is required",
  });
}

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const existingOtp =
  await OTP.findOne({
    email: email.toLowerCase(),
  });

if (
  existingOtp &&
  existingOtp.createdAt >
    new Date(Date.now() - 60000)
) {
  return res.status(429).json({
    success: false,
    message:
      "Please wait before requesting another OTP",
  });
}

await OTP.deleteMany({
      email: email.toLowerCase(),
    });

    await OTP.create({
      email: email.toLowerCase(),
      otp,
      expiresAt: new Date(
        Date.now() + 5 * 60 * 1000
      ),
    });

    await sendEmail({
      to: email,
      from : "noreply@zusko.in",
      subject: "Verify Your Email",
      html: `
        <h2>Verify your email</h2>

<p>Your One-Time Password is:</p>

<h1>${otp}</h1>

<p>
This OTP is valid for 5 minutes.
Do not share it with anyone.
</p>

<p>
Team Zusko
</p>
      `,
    });

    res.json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const {
  name,
  phone,
  email,
  otp
} = req.body;

    if (!email || !otp) {
  return res.status(400).json({
    success: false,
    message: "Email and OTP are required",
  });
}

    const otpRecord = await OTP.findOne({
  email: email.toLowerCase(),
  otp,
});

if (!otpRecord) {
  return res.status(400).json({
    success: false,
    message: "Invalid OTP",
  });
}

if (
  new Date() > otpRecord.expiresAt
) {
  return res.status(400).json({
    success: false,
    message: "OTP expired",
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
        isEmailVerified: true,
        phone,
      });
    }

    // Existing User
    else {
      user.isEmailVerified = true;
      if (name) {
        user.name = name;
        
      }

      // Update phone if changed
      if (phone && phone !== user.phone) {

  const existingPhone =
    await User.findOne({ phone });

  if (
    existingPhone &&
    existingPhone._id.toString() !==
      user._id.toString()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Phone number already in use",
    });
  }

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

    await OTP.deleteOne({
  _id: otpRecord._id,
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
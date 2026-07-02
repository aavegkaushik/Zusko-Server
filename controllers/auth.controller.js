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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const existingOtp = await OTP.findOne({
      email: email.toLowerCase(),
    });

    if (existingOtp && existingOtp.createdAt > new Date(Date.now() - 60000)) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP",
      });
    }

    await OTP.deleteMany({
      email: email.toLowerCase(),
    });

    await OTP.create({
      email: email.toLowerCase(),
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await sendEmail({
      to: email,
      from: "noreply@zusko.in",
      subject: "Verify your email • Zusko",

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Verify your email</title>
</head>

<body style="
margin:0;
padding:0;
background:#F6F7FB;
font-family:Inter,Arial,sans-serif;
">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:40px 20px;">

<table
width="560"
cellpadding="0"
cellspacing="0"
style="
background:#ffffff;
border-radius:20px;
overflow:hidden;
box-shadow:0 12px 40px rgba(0,0,0,.08);
">

<!-- Header -->

<tr>

<td
align="center"
style="
padding:40px;
background:#FFFFFF;
border-bottom:1px solid #F1F5F9;
"
>

<img
src="https://www.zusko.in/assets/zusko-CuTZ8EeH.png"
width="140"
alt="Zusko"
/>

</td>

</tr>

<!-- Content -->

<tr>

<td style="padding:40px;">

<p
style="
margin:0;
font-size:14px;
color:#777;
letter-spacing:.3px;
"
>
EMAIL VERIFICATION
</p>

<h1
style="
margin:10px 0 15px;
font-size:32px;
color:#111;
"
>
Verify your email
</h1>

<p
style="
margin:0;
font-size:16px;
line-height:28px;
color:#555;
"
>
Welcome to <strong>Zusko</strong>.
Use the verification code below to continue securely.
</p>

<!-- OTP -->

<div
style="
margin:35px 0;
text-align:center;
"
>

<div
style="
display:inline-block;
padding:18px 45px;
background:#FFF8D9;
border:1px solid #FFD54A;
border-radius:16px;
font-size:38px;
font-weight:800;
letter-spacing:10px;
color:#111;
"
>
${otp}
</div>

</div>

<!-- Info -->

<div
style="
background:#F8F9FB;
border-radius:14px;
padding:18px 22px;
margin-top:20px;
"
>

<p
style="
margin:0;
font-size:14px;
color:#555;
line-height:26px;
"
>

⏱️ This code is valid for
<strong>5 minutes</strong>.

<br><br>

🔒 Never share this OTP with anyone.

<br><br>

If you didn't request this verification,
you can safely ignore this email.

</p>

</div>

</td>

</tr>

<!-- Footer -->

<tr>

<td
style="
padding:30px 40px;
border-top:1px solid #F1F1F1;
background:#FAFAFA;
"
>

<p
style="
margin:0;
font-size:15px;
font-weight:700;
color:#111;
"
>
Team Zusko
</p>

<p
style="
margin:8px 0 0;
font-size:13px;
color:#888;
line-height:22px;
"
>
Premium Laundry • Free Pickup & Delivery

<br>

© ${new Date().getFullYear()} Zusko. All rights reserved.

</p>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
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
    const { name, phone, email, otp } = req.body;

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

    if (new Date() > otpRecord.expiresAt) {
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
        const existingPhone = await User.findOne({ phone });

        if (
          existingPhone &&
          existingPhone._id.toString() !== user._id.toString()
        ) {
          return res.status(400).json({
            success: false,
            message: "Phone number already in use",
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

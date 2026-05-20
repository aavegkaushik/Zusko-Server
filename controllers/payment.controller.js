import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import dotenv from "dotenv";
dotenv.config();

console.log("KEY =", JSON.stringify(process.env.RAZORPAY_KEY_ID));
console.log("SECRET =", JSON.stringify(process.env.RAZORPAY_KEY_SECRET));
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


// CREATE RAZORPAY ORDER
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: "zusko_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      data: order,
    });

  } catch (err) {
    console.error("RAZORPAY ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



// VERIFY PAYMENT
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    const body =
      razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(body.toString())
      .digest("hex");

    const isAuthentic =
      expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    await Order.findByIdAndUpdate(orderId, {
      "payment.status": "paid",
      "payment.razorpayOrderId": razorpay_order_id,
      "payment.razorpayPaymentId": razorpay_payment_id,
      "payment.verifiedAt": new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



// GET SAVED PAYMENT METHODS
export const getPaymentMethods = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("savedPaymentMethods");

    res.status(200).json({
      success: true,
      data: user.savedPaymentMethods || [],
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



// SAVE PAYMENT METHOD
export const addPaymentMethod = async (req, res) => {
  try {
    const {
      type,
      provider,
      maskedDetails,
      gatewayToken,
      isDefault,
    } = req.body;

    if (!type || !maskedDetails) {
      return res.status(400).json({
        success: false,
        message: "Missing payment details",
      });
    }

    const user = await User.findById(req.user._id);

    if (isDefault) {
      user.savedPaymentMethods.forEach((m) => {
        m.isDefault = false;
      });
    }

    user.savedPaymentMethods.push({
      type,
      provider,
      maskedDetails,
      gatewayToken,
      isDefault: isDefault || false,
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "Payment method saved",
      data: user.savedPaymentMethods,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



// DELETE PAYMENT METHOD
export const deletePaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    user.savedPaymentMethods =
      user.savedPaymentMethods.filter(
        (method) =>
          method._id.toString() !== req.params.id
      );

    await user.save();

    res.status(200).json({
      success: true,
      message: "Payment method deleted",
      data: user.savedPaymentMethods,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



// SET DEFAULT PAYMENT METHOD
export const setDefaultPaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    user.savedPaymentMethods.forEach((method) => {
      method.isDefault =
        method._id.toString() === req.params.id;
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "Default payment updated",
      data: user.savedPaymentMethods,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
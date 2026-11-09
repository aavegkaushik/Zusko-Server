import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import { delCache, delCachePattern, setCache, getCache } from "../utils/cache.js";
import { sendTelegramAlert } from "../services/telegramService.js";
import dotenv from "dotenv";
dotenv.config();

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || "rzp_live_TmBfYepQWFHBhS",
  key_secret: process.env.RAZORPAY_KEY_SECRET || process.env.VITE_RAZORPAY_KEY_SECRET || "dummy_secret",
});

export const refundPayment = async (order) => {
  try {
    const paymentId =
      order.payment?.razorpayPaymentId ||
      order.payment?.transactionId;

    if (!paymentId) {
      console.warn("Cannot refund: No razorpay payment ID found on order", order._id);
      return false;
    }

    const refundAmount = Math.round(Number(order.payment?.amount || order.total || 0) * 100);

    if (refundAmount <= 0) {
      console.warn("Cannot refund zero or negative amount:", refundAmount);
      return false;
    }

    const refund = await razorpay.payments.refund(paymentId, {
      amount: refundAmount,
      notes: {
        orderId: String(order._id),
        orderNumber: String(order.orderId || ""),
        reason: "Customer cancellation",
      },
    });

    await Order.findByIdAndUpdate(order._id, {
      "payment.status": "refunded",
      "payment.refundedAt": new Date(),
      refund: {
        status: "refunded",
        refundId: refund.id,
        amount: refundAmount / 100,
        initiatedAt: new Date(),
        completedAt: new Date(),
      },
      $push: {
        history: {
          status: "cancelled",
          changedAt: new Date(),
          note: `Refund processed: ₹${refundAmount / 100} (Refund ID: ${refund.id})`,
        },
      },
    });

    console.log("Refund processed successfully:", refund.id);
    return true;
  } catch (err) {
    console.error("Refund error:", err.message);
    await Order.findByIdAndUpdate(order._id, {
      refund: {
        status: "failed",
        amount: order.payment?.amount || order.total,
        initiatedAt: new Date(),
        error: err.message,
      },
    });
    return false;
  }
};

// CREATE RAZORPAY ORDER
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, orderId, orderData } = req.body;

    let finalAmount;
    let targetOrder = null;

    if (orderId) {
      targetOrder = await Order.findById(orderId);

      if (!targetOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (targetOrder.payment?.status === "paid") {
        return res.status(400).json({
          success: false,
          message: "Order already paid",
        });
      }

      // Read trusted amount from database record
      finalAmount = targetOrder.total;
    } else if (amount && Number(amount) > 0) {
      finalAmount = Number(amount);
    } else {
      return res.status(400).json({
        success: false,
        message: "Valid Amount or OrderId is required",
      });
    }

    const razorpayOrderOptions = {
      amount: Math.round(Number(finalAmount) * 100),
      currency: "INR",
      receipt: targetOrder
        ? String(targetOrder.orderId || targetOrder._id).substring(0, 40)
        : `REC_${Date.now()}`.substring(0, 40),
      notes: targetOrder
        ? {
            internal_order_id: String(targetOrder._id),
            order_number: String(targetOrder.orderId || ""),
          }
        : {
            user_id: String(req.user?._id || ""),
          },
    };

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);

    if (targetOrder) {
      await Order.findByIdAndUpdate(targetOrder._id, {
        "payment.razorpayOrderId": razorpayOrder.id,
      });
    }

    // Optional short-lived cache for webhook fallback if network drops before browser callback
    if (orderData && req.user?._id) {
      try {
        await setCache(
          `checkout:${razorpayOrder.id}`,
          { orderData, userId: req.user._id },
          3600
        );
      } catch (cacheErr) {
        // Cache error non-blocking
      }
    }

    res.status(200).json({
      success: true,
      data: razorpayOrder,
    });
  } catch (err) {
    console.error("RAZORPAY ORDER CREATION ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// VERIFY PAYMENT & CONFIRM ORDER
export const verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification parameters",
      });
    }

    // 1. Verify HMAC SHA256 signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed",
      });
    }

    // 2. If orderId is provided, link and mark order as paid
    if (orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Idempotency: If already paid, return early with current order
      if (order.payment?.status === "paid") {
        return res.status(200).json({
          success: true,
          message: "Order already paid",
          data: order,
        });
      }

      // Replay attack prevention: Ensure razorpay_payment_id is not already attached to another order
      const existingPaymentOrder = await Order.findOne({
        _id: { $ne: order._id },
        $or: [
          { "payment.razorpayPaymentId": razorpay_payment_id },
          { "payment.transactionId": razorpay_payment_id },
        ],
      });

      if (existingPaymentOrder) {
        return res.status(400).json({
          success: false,
          message: "Payment transaction has already been used for another order",
        });
      }

      // Fetch payment from Razorpay API to verify status and amount
      try {
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        if (
          !paymentDetails ||
          (paymentDetails.status !== "captured" && paymentDetails.status !== "authorized")
        ) {
          return res.status(400).json({
            success: false,
            message: `Payment is not confirmed (status: ${paymentDetails?.status || "unknown"})`,
          });
        }

        const expectedPaise = Math.round(Number(order.total) * 100);
        if (Number(paymentDetails.amount) < expectedPaise) {
          return res.status(400).json({
            success: false,
            message: "Paid amount does not match required order total",
          });
        }
      } catch (fetchErr) {
        console.warn("Warning: Could not fetch payment details from Razorpay API:", fetchErr.message);
      }

      // Atomically update order to paid status
      order.payment = {
        ...order.payment,
        status: "paid",
        method: "ONLINE",
        transactionId: razorpay_payment_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
        amount: order.total,
        paidAt: new Date(),
      };

      if (!Array.isArray(order.history)) {
        order.history = [];
      }
      order.history.push({
        status: order.status || "pending",
        changedAt: new Date(),
        note: `Online payment verified via Razorpay (Payment ID: ${razorpay_payment_id})`,
      });

      await order.save();

      // Invalidate Redis caches
      await delCache(`tracking:${order._id}`);
      await delCachePattern(`orders:*`);

      // Dispatch alert
      try {
        await sendTelegramAlert(
          `🎉 *PAID ORDER CONFIRMED!*\n` +
          `Order ID: \`${order.orderId}\`\n` +
          `Customer: *${order.customerName}* (${order.customerPhone || "N/A"})\n` +
          `Total: *₹${order.total}* (PAID ONLINE - Razorpay)\n` +
          `Payment ID: \`${razorpay_payment_id}\`\n` +
          `Pickup Date: ${order.pickup?.date || "N/A"} (${order.pickup?.time || "N/A"})`
        );
      } catch (alertErr) {
        console.warn("Telegram notification error:", alertErr.message);
      }

      return res.status(200).json({
        success: true,
        message: "Payment verified and order confirmed",
        data: order,
      });
    }

    // Default standalone verification response
    return res.status(200).json({
      success: true,
      message: "Payment signature verified",
    });
  } catch (err) {
    console.error("PAYMENT VERIFICATION ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// RAZORPAY WEBHOOK HANDLER (Asynchronous server-side fallback)
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.RAZORPAY_KEY_SECRET;

    if (!signature || !webhookSecret) {
      console.warn("Webhook received without signature or secret not configured.");
      return res.status(400).json({ success: false, message: "Missing webhook signature" });
    }

    const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("Invalid Razorpay webhook signature.");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body;
    console.log("Razorpay Webhook Event Received:", event?.event);

    if (event?.event === "payment.captured" || event?.event === "order.paid") {
      const paymentEntity = event?.payload?.payment?.entity;
      if (!paymentEntity) {
        return res.status(200).json({ success: true, message: "No payment entity in webhook" });
      }

      const paymentId = paymentEntity.id;
      const razorpayOrderId = paymentEntity.order_id;
      const internalOrderId = paymentEntity.notes?.internal_order_id;
      const orderNumber = paymentEntity.notes?.order_number;

      // Find matching order
      const criteria = [];
      if (internalOrderId && mongoose.isValidObjectId(internalOrderId)) {
        criteria.push({ _id: internalOrderId });
      }
      if (orderNumber) {
        criteria.push({ orderId: orderNumber });
      }
      if (razorpayOrderId) {
        criteria.push({ "payment.razorpayOrderId": razorpayOrderId });
      }

      if (criteria.length > 0) {
        const order = await Order.findOne({ $or: criteria });
        if (order && order.payment?.status !== "paid") {
          order.payment = {
            ...order.payment,
            status: "paid",
            method: "ONLINE",
            transactionId: paymentId,
            razorpayPaymentId: paymentId,
            razorpayOrderId: razorpayOrderId,
            amount: order.total,
            paidAt: new Date(),
          };

          if (!Array.isArray(order.history)) order.history = [];
          order.history.push({
            status: order.status || "pending",
            changedAt: new Date(),
            note: `Online payment captured via Razorpay Webhook (${paymentId})`,
          });

          await order.save();
          await delCache(`tracking:${order._id}`);
          await delCachePattern(`orders:*`);

          try {
            await sendTelegramAlert(
              `⚡ *WEBHOOK: PAYMENT CAPTURED!*\n` +
              `Order ID: \`${order.orderId}\`\n` +
              `Customer: *${order.customerName}*\n` +
              `Total: *₹${order.total}* (PAID ONLINE - Webhook Reconciled)\n` +
              `Payment ID: \`${paymentId}\``
            );
          } catch (e) {}

          console.log(`Order ${order.orderId} updated to PAID via Webhook.`);
        }
      }
    }

    return res.status(200).json({ success: true, status: "ok" });
  } catch (err) {
    console.error("Razorpay webhook handler error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const payPendingOrder = async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const body =
      razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    // Idempotency: check if order is already paid
    const existingOrder = await Order.findById(orderId);
    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (existingOrder.payment?.status === "paid") {
      return res.status(200).json({
        success: true,
        message: "Order already paid",
        data: existingOrder,
      });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        "payment.status": "paid",
        "payment.method": "ONLINE",
        "payment.transactionId": razorpay_payment_id,
        "payment.razorpayOrderId": razorpay_order_id,
        "payment.razorpayPaymentId": razorpay_payment_id,
        "payment.razorpaySignature": razorpay_signature,
        "payment.paidAt": new Date(),
      },
      { new: true }
    );

    // Invalidate tracking cache
    await delCache(`tracking:${orderId}`);
    await delCachePattern(`orders:*`);

    res.json({
      success: true,
      data: order,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// VERIFY PAYMENT
// export const verifyPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       orderId,
//     } = req.body;

//     const body =
//       razorpay_order_id + "|" + razorpay_payment_id;

//     const expectedSignature = crypto
//       .createHmac(
//         "sha256",
//         process.env.RAZORPAY_KEY_SECRET
//       )
//       .update(body.toString())
//       .digest("hex");

//     const isAuthentic =
//       expectedSignature === razorpay_signature;

//     if (!isAuthentic) {
//       return res.status(400).json({
//         success: false,
//         message: "Payment verification failed",
//       });
//     }
//     if (
//   order.payment?.status === "paid"
// ) {
//   return res.status(400).json({
//     success: false,
//     message:
//       "Order already paid",
//   });
// }

//     const order = await Order.findById(
//   orderId
// );

// if (!order) {
//   return res.status(404).json({
//     success: false,
//     message: "Order not found",
//   });
// }

//     // await Order.findByIdAndUpdate(orderId, {
//     //   "payment.status": "paid",
//     //   "payment.razorpayOrderId": razorpay_order_id,
//     //   "payment.razorpayPaymentId": razorpay_payment_id,
//     //   "payment.verifiedAt": new Date(),
//     // });

//     res.status(200).json({
//       success: true,
//       message: "Payment verified successfully",
//     });

//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: err.message,
//     });
//   }
// };



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
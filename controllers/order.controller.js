import Order from "../models/order.model.js";
import { sendTelegramAlert } from "../services/telegramService.js";
import User from "../models/User.model.js";
import { sendEmail } from "../utils/sendEmail.js";
import { generateOrderPlacedEmail } from "../utils/orderEmails.js";
import Coupon from "../models/coupon.model.js";
import CouponUsage from "../models/couponUsage.model.js";
// import { refundPayment } from "./payment.controller.js";
// GET ACTIVE ORDERS
export const getActiveOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
      status: {
        $nin: ["completed", "cancelled"],
      },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ORDER HISTORY
export const getOrderHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
      status: {
        $in: ["completed", "cancelled"],
      },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET SINGLE ORDER TRACKING
export const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
  success: true,
  data: {
    _id: order._id,
    orderId: order.orderId,

    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,

    status: order.status,

    pickup: order.pickup,
    pickupContact: order.pickupContact,

    address: order.address,

    items: order.items,

    originalTotal: order.originalTotal || 0,
    handlingFee: order.handlingFee || 0,
    deliveryFee: order.deliveryFee || 0,
    discount: order.discount || 0,

    total: order.total,

    payment: order.payment,

    history: order.history,

    estimatedDelivery:
      order.estimatedDelivery || null,

    deliveryAgent:
      order.deliveryAgent || null,

    createdAt: order.createdAt,
  },
});
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// CANCEL ORDER
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // allowed only before processing starts
    if (
      [
        "in-progress",
        "ready-for-delivery",
        "out-for-delivery",
        "completed",
      ].includes(order.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled now",
      });
    }

    order.status = "cancelled";

    order.history.push({
      status: "cancelled",
      changedAt: new Date(),
      note: "Cancelled by customer",
    });

    await order.save();

    if (
    order.payment?.status === "paid"
) {

    order.refund = {
        status: "processing",
        amount: order.payment.amount,
        initiatedAt: new Date(),
    };

    await order.save();

//     console.log(order.payment);
// console.log("Payment ID:", order.payment?.razorpayPaymentId);

    // await refundPayment(order);

}

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// RATE ORDER
export const rateOrder = async (req, res) => {
  try {
    const { stars, review } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { customerId: req.user._id },
        { customerPhone: req.user.phone },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Only completed orders can be rated",
      });
    }

    if (order.rating?.stars) {
      return res.status(400).json({
        success: false,
        message: "Order already rated",
      });
    }

    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const rating = {
      stars,
      review: review || "",
      ratedAt: new Date(),
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          rating,
        },
      },
      {
        new: true,
        runValidators: false,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Rating submitted successfully",
      data: rating,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      pickupContact,
      pickup,
      address,
      items,
      couponCode,
      deliveryFee = 0,
      handlingFee = 0,
      payment,
    } = req.body;

    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: "No items in order",
      });
    }

    // -----------------------------------------
    // FORMAT ITEMS
    // -----------------------------------------

    const formattedItems = items.map((item) => ({
      name: item.name,
      qty: Number(item.qty),
      price: Number(item.price),
      service: item.service,
    }));

    // -----------------------------------------
    // CALCULATE ORIGINAL TOTAL ON SERVER
    // -----------------------------------------

    const originalTotal = formattedItems.reduce(
      (acc, item) =>
        acc + item.qty * item.price,
      0
    );

    let discount = 0;
    let appliedCoupon = null;

    // -----------------------------------------
    // COUPON VALIDATION
    // -----------------------------------------

    if (couponCode) {
      const normalizedCode =
        couponCode.trim().toUpperCase();

      const coupon = await Coupon.findOne({
        code: normalizedCode,
        isActive: true,
      });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Invalid or inactive coupon",
        });
      }

      const now = new Date();

      // Valid from
      if (
        coupon.validFrom &&
        now < coupon.validFrom
      ) {
        return res.status(400).json({
          success: false,
          message: "Coupon is not active yet",
        });
      }

      // Expiry
      if (
        coupon.validUntil &&
        now > coupon.validUntil
      ) {
        return res.status(400).json({
          success: false,
          message: "Coupon has expired",
        });
      }

      // Global usage limit
      if (
        coupon.usageLimit !== null &&
        coupon.usedCount >= coupon.usageLimit
      ) {
        return res.status(400).json({
          success: false,
          message: "Coupon usage limit reached",
        });
      }

      // Minimum order
      if (
        originalTotal <
        coupon.minOrderValue
      ) {
        return res.status(400).json({
          success: false,
          message: `Minimum order ₹${coupon.minOrderValue} required`,
        });
      }

      // -----------------------------------------
      // FIRST ORDER CHECK
      // -----------------------------------------

      if (
        coupon.firstOrderOnly ||
        coupon.newUsersOnly
      ) {
        const previousOrders =
          await Order.countDocuments({
            customerId: userId,
            status: {
              $ne: "cancelled",
            },
          });

        if (previousOrders > 0) {
          return res.status(400).json({
            success: false,
            message:
              "This coupon is only valid on your first order",
          });
        }
      }

      // -----------------------------------------
      // USER-SPECIFIC COUPON
      // -----------------------------------------

      if (
        coupon.applicableUsers &&
        coupon.applicableUsers.length > 0
      ) {
        const allowed =
          coupon.applicableUsers.some(
            (id) =>
              id.toString() ===
              userId.toString()
          );

        if (!allowed) {
          return res.status(400).json({
            success: false,
            message:
              "This coupon is not available for your account",
          });
        }
      }

      // -----------------------------------------
      // SERVICE CHECK
      // -----------------------------------------

      if (
        coupon.applicableServices &&
        coupon.applicableServices.length > 0
      ) {
        const allServicesAllowed =
          formattedItems.every((item) =>
            coupon.applicableServices.includes(
              item.service
            )
          );

        if (!allServicesAllowed) {
          return res.status(400).json({
            success: false,
            message:
              "Coupon is not valid for selected services",
          });
        }
      }

      // -----------------------------------------
      // CHECK USER USAGE
      // -----------------------------------------

      const usageCount =
        await CouponUsage.countDocuments({
          couponId: coupon._id,
          userId,
          status: "used",
        });

      if (
        usageCount >= coupon.perUserLimit
      ) {
        return res.status(400).json({
          success: false,
          message:
            "You have already used this coupon",
        });
      }

      // -----------------------------------------
      // CALCULATE DISCOUNT
      // -----------------------------------------

      if (
        coupon.discountType === "flat"
      ) {
        discount =
          coupon.discountValue;
      }

      if (
        coupon.discountType ===
        "percentage"
      ) {
        discount =
          (originalTotal *
            coupon.discountValue) /
          100;
      }

      // Maximum discount
      if (
        coupon.maxDiscount !== null &&
        discount > coupon.maxDiscount
      ) {
        discount =
          coupon.maxDiscount;
      }

      // Never discount more than subtotal
      discount = Math.min(
        discount,
        originalTotal
      );

      discount = Math.round(
        discount * 100
      ) / 100;

      appliedCoupon = coupon;
    }

    // -----------------------------------------
    // FINAL TOTAL
    // -----------------------------------------

    const finalAmount = Math.max(
      originalTotal +
        Number(deliveryFee || 0) +
        Number(handlingFee || 0) -
        discount,
      0
    );

    // -----------------------------------------
    // ORDER ID
    // -----------------------------------------

    const orderId =
      "ZSK" +
      Date.now() +
      Math.floor(
        Math.random() * 1000
      );

    // -----------------------------------------
    // CREATE ORDER
    // -----------------------------------------

    const order = await Order.create({
      vendorId:
        "6962ad3e962db6a05ddb10dd",

      orderId,

      customerId: userId,

      customerName:
        customerName ||
        req.user?.name ||
        "Guest",

      customerPhone:
        customerPhone ||
        req.user?.phone ||
        "",

      customerEmail:
        req.user?.email,

      pickupContact:
        pickupContact || {
          name:
            customerName ||
            req.user?.name ||
            "",

          phone:
            customerPhone ||
            req.user?.phone ||
            "",

          isAlternate: false,
        },

      items: formattedItems,

      total: finalAmount,

      originalTotal,

      handlingFee:
        Number(handlingFee || 0),

      discount,

      deliveryFee:
        Number(deliveryFee || 0),

      address,

      pickup,

      payment: {
        method:
          payment?.method || "COD",

        status:
          payment?.status ||
          "pending",

        amount: finalAmount,

        razorpayPaymentId:
          payment?.razorpayPaymentId ||
          null,
      },

      meta: {
        couponCode:
          appliedCoupon?.code || null,

        couponId:
          appliedCoupon?._id || null,
      },

      history: [
        {
          status: "pending",
          changedAt: new Date(),
          note: appliedCoupon
            ? `Order created with coupon ${appliedCoupon.code}`
            : "Order created",
        },
      ],
    });

    // -----------------------------------------
    // RECORD COUPON USAGE
    // -----------------------------------------

    if (appliedCoupon) {
      try {
        await CouponUsage.create({
          couponId: appliedCoupon._id,
          userId,
          orderId: order._id,
          discountAmount: discount,
          status: "used",
        });

        await Coupon.findByIdAndUpdate(
          appliedCoupon._id,
          {
            $inc: {
              usedCount: 1,
            },
          }
        );
      } catch (couponUsageError) {
        console.error(
          "COUPON USAGE ERROR:",
          couponUsageError
        );

        // Important:
        // If coupon usage failed, do not silently
        // pretend that the coupon was consumed.
      }
    }

    // -----------------------------------------
    // TELEGRAM ALERT
    // -----------------------------------------

    sendTelegramAlert(order);

    // -----------------------------------------
    // CONFIRMATION EMAIL
    // -----------------------------------------

    try {
      if (order.customerEmail) {
        await sendEmail({
          to: order.customerEmail,

          from:
            process.env.ORDERS_MAIL_FROM ||
            process.env.MAIL_FROM,

          subject:
            `Your Zusko Order #${order.orderId} is Confirmed 🎉`,

          html:
            generateOrderPlacedEmail(
              order.toObject()
            ),
        });

        console.log(
          `Order confirmation email sent to ${order.customerEmail}`
        );
      }
    } catch (emailError) {
      console.error(
        "Order confirmation email failed:",
        emailError.message
      );
    }

    // -----------------------------------------
    // RESPONSE
    // -----------------------------------------

    return res.status(201).json({
      success: true,
      message:
        "Order created successfully",

      data: order,

      coupon: appliedCoupon
        ? {
            code:
              appliedCoupon.code,

            discount,
          }
        : null,
    });
  } catch (err) {
    console.error(
      "ORDER ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// export const getOrdersByPhone = async (req, res) => {
//   const orders = await Order.find({
//     customerPhone: req.params.phone,
//   }).sort({ createdAt: -1 });

//   res.json(orders);
// };

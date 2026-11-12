import Order from "../models/order.model.js";
import DeliveryPartner from "../models/DeliveryPartner.js";
import { sendTelegramAlert } from "../services/telegramService.js";
import { sendEmail } from "../utils/sendEmail.js";
import { generateOrderPlacedEmail, generateOrderCancelledEmail } from "../utils/orderEmails.js";
import Coupon from "../models/coupon.model.js";
import CouponUsage from "../models/couponUsage.model.js";
import { checkEligibility } from "./coupon.controller.js";
import Address from "../models/Address.js";
import { calculateDelivery } from "../services/deliveryService.js";
import { getCache, setCache, delCache, delCachePattern } from "../utils/cache.js";
import { emailQueue, notificationQueue, dispatchJob } from "../queues/queueManager.js";
import Pricing from "../models/Pricing.js";
import Promotion from "../models/Promotion.js";
import {
  isPromotionActive,
  calculateItemPromotionalPricing,
} from "../utils/promotionCalculator.js";
import mongoose from "mongoose";
import crypto from "crypto";
import { refundPayment, razorpay } from "./payment.controller.js";
import logger from "../utils/logger.js";


// Helper to query user orders safely whether phone is set or empty
const getUserOrderCriteria = (user) => {
  if (user?.phone) {
    return {
      $or: [
        { customerId: user._id },
        { customerPhone: user.phone },
      ],
    };
  }
  return { customerId: user._id };
};

// Validate that pickup slot is in the future and time slot has not elapsed
export const validatePickupSlot = (pickup) => {
  if (!pickup || typeof pickup !== "object") {
    return { valid: false, message: "Pickup schedule details are required" };
  }

  const { date, time } = pickup;
  if (!date || !time) {
    return { valid: false, message: "Pickup date and time slot are required" };
  }

  const normalizedPickupDate = String(date).split("T")[0];
  const pickupDateObj = new Date(normalizedPickupDate);
  if (isNaN(pickupDateObj.getTime())) {
    return { valid: false, message: "Invalid pickup date format" };
  }

  // Calculate current date and hour in Indian Standard Time (UTC + 5:30)
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const istTodayStr = istNow.toISOString().split("T")[0]; // YYYY-MM-DD in IST

  // 1. Date cannot be before today in IST
  if (normalizedPickupDate < istTodayStr) {
    return { valid: false, message: "Pickup date cannot be in the past" };
  }

  // 2. If pickup date is today in IST, validate that the time slot has not elapsed
  if (normalizedPickupDate === istTodayStr) {
    const currentHourIST = istNow.getUTCHours(); // Hours 0-23 in IST

    const slotEndHours = {
      "9 AM - 12 PM": 12,
      "12 PM - 3 PM": 15,
      "3 PM - 6 PM": 18,
      "10:00 AM - 01:00 PM": 13,
    };

    const trimmedTime = String(time).trim();
    const endHour = slotEndHours[trimmedTime];
    if (endHour !== undefined && currentHourIST >= endHour) {
      return {
        valid: false,
        message: `The selected pickup slot (${trimmedTime}) for today has already passed. Please choose an upcoming time slot.`,
      };
    }
  }

  return { valid: true };
};

// Helper to format strictly public partner info (Full Name, Avatar, Mobile Number)
const formatPublicPartner = (partnerDoc) => {
  if (!partnerDoc) return null;
  return {
    fullName: partnerDoc.fullName || "",
    avatar: partnerDoc.avatar || "",
    mobileNumber: partnerDoc.mobileNumber || "",
  };
};

const formatPartnerAssignment = (assignment, legacyAgent = null) => {
  if (assignment && assignment.partnerId) {
    const p = assignment.partnerId;
    return {
      partner: formatPublicPartner(p),
      assignedAt: assignment.assignedAt || null,
      status: assignment.status || "assigned",
      pickedUpAt: assignment.pickedUpAt || null,
      deliveredAt: assignment.deliveredAt || null,
    };
  }
  if (legacyAgent && (legacyAgent.name || legacyAgent.phone)) {
    return {
      partner: {
        fullName: legacyAgent.name || "",
        avatar: "",
        mobileNumber: legacyAgent.phone || "",
      },
      assignedAt: null,
      status: "assigned",
      pickedUpAt: null,
      deliveredAt: null,
    };
  }
  return null;
};

// =========================================================
// GET ACTIVE ORDERS
// =========================================================
export const getActiveOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      ...getUserOrderCriteria(req.user),
      status: {
        $nin: ["completed", "cancelled"],
      },
    })
      .populate("pickupPartner.partnerId", "fullName avatar mobileNumber")
      .populate("deliveryPartner.partnerId", "fullName avatar mobileNumber")
      .sort({ createdAt: -1 })
      .lean();

    const sanitizedOrders = orders.map((order) => ({
      ...order,
      pickupPartner: formatPartnerAssignment(order.pickupPartner),
      deliveryPartner: formatPartnerAssignment(order.deliveryPartner, order.deliveryAgent),
    }));

    return res.status(200).json({
      success: true,
      count: sanitizedOrders.length,
      data: sanitizedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// GET ORDER HISTORY
// =========================================================
export const getOrderHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      ...getUserOrderCriteria(req.user),
      status: {
        $in: ["completed", "cancelled"],
      },
    })
      .populate("pickupPartner.partnerId", "fullName avatar mobileNumber")
      .populate("deliveryPartner.partnerId", "fullName avatar mobileNumber")
      .sort({ createdAt: -1 })
      .lean();

    const sanitizedOrders = orders.map((order) => ({
      ...order,
      pickupPartner: formatPartnerAssignment(order.pickupPartner),
      deliveryPartner: formatPartnerAssignment(order.deliveryPartner, order.deliveryAgent),
    }));

    return res.status(200).json({
      success: true,
      count: sanitizedOrders.length,
      data: sanitizedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// GET SINGLE ORDER TRACKING
// =========================================================
export const getOrderTracking = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID format",
      });
    }

    const trackingCacheKey = `tracking:${req.params.id}`;

    // Fast Redis read cache (15s TTL)
    const cachedData = await getCache(trackingCacheKey);
    if (cachedData) {
      return res.status(200).json({
        success: true,
        data: cachedData,
      });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      ...getUserOrderCriteria(req.user),
    })
      .populate("pickupPartner.partnerId", "fullName avatar mobileNumber")
      .populate("deliveryPartner.partnerId", "fullName avatar mobileNumber")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const pickupPartnerData = formatPartnerAssignment(order.pickupPartner);
    const deliveryPartnerData = formatPartnerAssignment(order.deliveryPartner, order.deliveryAgent);

    const trackingData = {
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
      promotionalDiscount: order.promotionalDiscount || 0,
      handlingFee: order.handlingFee || 0,
      deliveryFee: order.deliveryFee || 0,
      discount: order.discount || 0,
      coupon: order.coupon || null,

      total: order.total,

      payment: order.payment,

      history: order.history,

      estimatedDelivery: order.estimatedDelivery || null,

      pickupPartner: pickupPartnerData,
      deliveryPartner: deliveryPartnerData,

      deliveryAgent: order.deliveryAgent || null,

      createdAt: order.createdAt,
    };

    // Cache tracking data with short TTL (15 seconds)
    await setCache(trackingCacheKey, trackingData, 15);

    return res.status(200).json({
      success: true,
      data: trackingData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// Helper to dispatch cancellation email to user via BullMQ queue (with background fallback)
export const dispatchCancellationEmail = async (order, reason = "") => {
  if (!order || !order.customerEmail) {
    logger.warn("Cannot dispatch cancellation email: missing customerEmail", {
      orderId: order?.orderId || order?._id,
    });
    return;
  }

  const orderData = order.toObject ? order.toObject() : order;
  const subject = `Important: Your Zusko Order #${orderData.orderId || orderData._id} Has Been Cancelled`;

  dispatchJob(
    emailQueue,
    "send-order-cancelled-email",
    { order: orderData, reason },
    async (data) => {
      try {
        await sendEmail({
          to: data.order.customerEmail,
          from: process.env.ORDER_MAIL || process.env.MAIL_FROM,
          subject,
          html: generateOrderCancelledEmail(data.order, data.reason),
        });
        logger.info(`Order cancellation email sent to ${data.order.customerEmail}`);
      } catch (emailErr) {
        logger.error(`Order cancellation email fallback failed: ${emailErr.message}`);
      }
    },
    { jobId: `cancel-email-${orderData.orderId || orderData._id}-${Date.now()}` }
  ).catch((err) => logger.error(`Error dispatching cancellation email job: ${err.message}`));
};

// =========================================================
// CANCEL ORDER
// =========================================================
export const cancelOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID format",
      });
    }

    // Identify whether cancellation was triggered by the company/admin or by the customer
    const isCompanyCancellation =
      req.user?.role === "admin" ||
      req.body?.cancelledBy === "company" ||
      req.body?.cancelledBy === "admin" ||
      req.body?.by === "company" ||
      req.body?.by === "admin";

    const reason = req.body?.reason || req.body?.cancellationReason || "";

    // Company/admin can cancel any order globally; customer can only cancel their own order
    const query = isCompanyCancellation
      ? { _id: req.params.id }
      : { _id: req.params.id, ...getUserOrderCriteria(req.user) };

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled",
      });
    }

    // Business rule: Customer cannot cancel after processing starts
    if (!isCompanyCancellation) {
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
    } else {
      if (order.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel an already completed order",
        });
      }
    }

    order.status = "cancelled";

    if (!Array.isArray(order.history)) {
      order.history = [];
    }

    const note = isCompanyCancellation
      ? `Cancelled by company${reason ? `: ${reason}` : ""}`
      : `Cancelled by customer${reason ? `: ${reason}` : ""}`;

    order.history.push({
      status: "cancelled",
      changedAt: new Date(),
      note,
    });

    if (!order.meta) {
      order.meta = {};
    }
    order.meta.cancelledBy = isCompanyCancellation ? "company" : "customer";
    if (reason) {
      order.meta.cancellationReason = reason;
    }

    await order.save();

    // Invalidate tracking cache on cancellation
    await delCache(`tracking:${req.params.id}`);

    // Refund handling if already paid online
    if (order.payment?.status === "paid") {
      order.refund = {
        status: "processing",
        amount: order.payment.amount,
        initiatedAt: new Date(),
      };

      await order.save();

      // Process automatic refund via Razorpay API
      await refundPayment(order);
    }

    // CRITICAL: Send cancellation email ONLY when cancelled by company (NOT when user cancels themselves)
    if (isCompanyCancellation && order.customerEmail) {
      dispatchCancellationEmail(order, reason);
    }

    return res.status(200).json({
      success: true,
      message: isCompanyCancellation
        ? "Order cancelled by company successfully. Customer has been notified via email."
        : "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =========================================================
// CANCEL ORDER BY COMPANY (ADMIN ROUTE)
// =========================================================
export const cancelOrderByCompany = async (req, res) => {
  req.body = req.body || {};
  req.body.cancelledBy = "company";
  return cancelOrder(req, res);
};

// =========================================================
// UPDATE ORDER STATUS (ADMIN ROUTE)
// =========================================================
export const updateOrderStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID format",
      });
    }

    const { status, note, reason } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // If company changes status to cancelled, route to cancellation handler (which triggers email + refund)
    if (status === "cancelled") {
      req.body.cancelledBy = "company";
      req.body.reason = reason || note;
      return cancelOrder(req, res);
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.status = status;
    if (!Array.isArray(order.history)) {
      order.history = [];
    }
    order.history.push({
      status,
      changedAt: new Date(),
      note: note || `Status updated to ${status} by admin`,
    });

    await order.save();
    await delCache(`tracking:${req.params.id}`);

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// RATE ORDER
// =========================================================
export const rateOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID format",
      });
    }

    const { stars, review } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      ...getUserOrderCriteria(req.user),
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

    const numericStars = Number(stars);

    if (
      !Number.isFinite(numericStars) ||
      numericStars < 1 ||
      numericStars > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const rating = {
      stars: numericStars,
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

    // Invalidate tracking cache on rating
    await delCache(`tracking:${req.params.id}`);

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


// =========================================================
// CREATE ORDER
// =========================================================
export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      pickupContact,
      pickup,
      address,
      items,
      payment,
      couponCode,
    } = req.body;

    const userId = req.user?._id;

    // -------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // -------------------------------------------------------
    // ITEMS VALIDATION
    // -------------------------------------------------------
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items in order",
      });
    }

    // -------------------------------------------------------
    // ADDRESS VALIDATION
    // -------------------------------------------------------
    if (!address || typeof address !== "object") {
      return res.status(400).json({
        success: false,
        code: "ADDRESS_REQUIRED",
        message: "Delivery address is required",
      });
    }

    // -------------------------------------------------------
    // PICKUP SCHEDULE VALIDATION
    // -------------------------------------------------------
    const slotValidation = validatePickupSlot(pickup);
    if (!slotValidation.valid) {
      return res.status(400).json({
        success: false,
        code: "INVALID_PICKUP_SLOT",
        message: slotValidation.message,
      });
    }

    // =======================================================
    // RECALCULATE PRICES USING TRUSTED DATABASE RECORDS
    // NEVER TRUST FRONTEND-SUBMITTED PRICES, DISCOUNTS OR TOTALS
    // =======================================================
    const now = new Date();

    // 1. Fetch active promotions from MongoDB
    let activePromotions = [];
    try {
      activePromotions = await Promotion.find({
        isActive: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      })
        .sort({ priority: -1, updatedAt: -1 })
        .lean();
    } catch (promoErr) {
      console.warn("Could not query promotions for checkout:", promoErr.message);
      activePromotions = [];
    }

    // 2. Fetch Pricing documents from MongoDB for all items
    const pricingIds = items
      .map((it) => it.pricingId || it.clothId || it._id)
      .filter((id) => id && mongoose.isValidObjectId(id));

    const itemNames = items
      .map((it) => (typeof it.name === "string" ? it.name.trim() : ""))
      .filter(Boolean);

    const pricingDocs = await Pricing.find({
      $or: [
        ...(pricingIds.length ? [{ _id: { $in: pricingIds } }] : []),
        ...(itemNames.length ? [{ name: { $in: itemNames } }] : []),
      ],
    }).lean();

    const findPricingDoc = (item) => {
      const targetId = String(item.pricingId || item.clothId || item._id || "");
      if (targetId) {
        const found = pricingDocs.find((p) => String(p._id) === targetId);
        if (found) return found;
      }
      return (
        pricingDocs.find(
          (p) =>
            p.name?.trim().toLowerCase() === String(item.name || "").trim().toLowerCase() &&
            p.service === item.service &&
            (item.service === "Dry Clean"
              ? (p.careLevel || "regular") === (item.careLevel || "regular")
              : true) &&
            (item.category ? p.category === item.category : true)
        ) ||
        pricingDocs.find(
          (p) =>
            p.name?.trim().toLowerCase() === String(item.name || "").trim().toLowerCase() &&
            p.service === item.service
        )
      );
    };

    // 3. Format items and permanently snapshot prices and promotion data
    const formattedItems = [];
    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty || item.quantity || 1)));
      const pricingDoc = findPricingDoc(item);

      if (!pricingDoc) {
        return res.status(400).json({
          success: false,
          message: `Item not available in pricing catalog: ${item.name || "Unknown item"}`,
        });
      }

      // Compute dynamic discount using trusted original price from database
      const promoPricing = calculateItemPromotionalPricing(
        pricingDoc,
        activePromotions,
        now
      );

      const originalUnitPrice = Number(pricingDoc.price) || 0;
      const discountAmount = Number(promoPricing.discountAmount) || 0;
      const discountPercentage = Number(promoPricing.discountPercentage) || 0;
      const finalUnitPrice = Number(promoPricing.finalPrice) || originalUnitPrice;
      const lineTotal = Math.round(finalUnitPrice * qty * 100) / 100;
      const originalLineTotal = Math.round(originalUnitPrice * qty * 100) / 100;

      formattedItems.push({
        clothId: pricingDoc._id,
        pricingId: pricingDoc._id,
        name: pricingDoc.name,
        service: pricingDoc.service,
        category: pricingDoc.category || item.category || "",
        variant: pricingDoc.variant || item.variant || "",
        careLevel:
          pricingDoc.service === "Dry Clean"
            ? item.careLevel === "premium" || pricingDoc.careLevel === "premium"
              ? "premium"
              : "regular"
            : "regular",
        qty,
        originalPrice: originalUnitPrice,
        discountPercentage,
        discountAmount,
        finalPrice: finalUnitPrice,
        price: finalUnitPrice, // Maintains backward compatibility for invoice/tracking
        lineTotal,
        originalLineTotal,
        appliedPromotionName: promoPricing.appliedPromotionName || "",
        appliedPromotion: promoPricing.appliedPromotion || null,
      });
    }

    if (formattedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid items in order",
      });
    }

    // Server-side subtotal recalculation - NEVER trust client prices
    const originalTotal =
      Math.round(
        formattedItems.reduce((sum, item) => sum + item.originalLineTotal, 0) * 100
      ) / 100;

    const discountedSubtotal =
      Math.round(
        formattedItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100
      ) / 100;

    const promotionalDiscount =
      Math.round((originalTotal - discountedSubtotal) * 100) / 100;

    if (!Number.isFinite(discountedSubtotal) || discountedSubtotal < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    // =======================================================
    // GET CUSTOMER LOCATION
    // =======================================================
    const latitude =
      address?.location?.latitude ??
      address?.lat;

    const longitude =
      address?.location?.longitude ??
      address?.lng;

    if (
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude))
    ) {
      return res.status(400).json({
        success: false,
        code: "LOCATION_REQUIRED",
        message:
          "Please select a valid delivery location",
      });
    }

    // =======================================================
    // SERVER-SIDE DELIVERY CALCULATION
    // =======================================================
    let deliveryCalculation;

    try {
      deliveryCalculation =
        await calculateDelivery({
          latitude: Number(latitude),
          longitude: Number(longitude),
          orderValue: discountedSubtotal,
        });
    } catch (error) {
      if (
        error.code ===
        "OUTSIDE_SERVICE_AREA"
      ) {
        return res.status(400).json({
          success: false,
          code: "OUTSIDE_SERVICE_AREA",
          message:
            "We are not serving in this area yet",
        });
      }

      throw error;
    }

    const serverDeliveryFee =
      discountedSubtotal >= 499
        ? 0
        : Number(
            deliveryCalculation?.deliveryFee || 0
          );

    const roadDistanceKm =
      Number(
        deliveryCalculation?.distanceKm || 0
      );

    const deliveryRatePerKm =
      Number(
        deliveryCalculation?.ratePerKm || 0
      );

    // =======================================================
    // HANDLING FEE
    // =======================================================
    const handlingFee =
      discountedSubtotal > 0 ? 15 : 0;

    // =======================================================
    // COUPON VALIDATION & STACKING PREVENTION
    // =======================================================
    let discount = 0;
    let appliedCoupon = null;

    if (
      couponCode &&
      String(couponCode).trim()
    ) {
      const normalizedCode =
        String(couponCode)
          .trim()
          .toUpperCase();

      // Check stacking restriction:
      // Prevent stacking of promotional discounts and coupons
      const hasDiscountedItems = formattedItems.some(
        (it) =>
          Number(it.discountAmount) > 0 ||
          Boolean(it.appliedPromotion) ||
          (it.originalPrice && it.finalPrice < it.originalPrice)
      );

      if (promotionalDiscount > 0 || hasDiscountedItems) {
        return res.status(400).json({
          success: false,
          code: "PROMOTION_NO_STACKING",
          message:
            "Coupons cannot be applied to already discounted items",
        });
      }

      const coupon =
        await Coupon.findOne({
          code: normalizedCode,
          isActive: true,
        });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid or inactive coupon",
        });
      }

      // Use centralized coupon eligibility logic against trusted discountedSubtotal
      const eligibility =
        await checkEligibility(
          coupon,
          req.user,
          discountedSubtotal,
          formattedItems
        );

      if (!eligibility.eligible) {
        return res.status(400).json({
          success: false,
          message:
            eligibility.message ||
            "Coupon is not valid",
        });
      }

      discount =
        Math.round(
          Number(
            eligibility.discount || 0
          ) * 100
        ) / 100;

      appliedCoupon = coupon;
    }

    // =======================================================
    // FINAL TOTAL
    // =======================================================
    const finalAmount =
      Math.max(
        Math.round(
          (
            discountedSubtotal +
            serverDeliveryFee +
            handlingFee -
            discount
          ) * 100
        ) / 100,
        0
      );

    // =======================================================
    // PRICE CHANGE / PROMOTION DESYNC DETECTION
    // =======================================================
    // If client provided total or expectedTotal and it significantly differs (> 1 INR)
    // from database-calculated finalAmount, notify client with latest calculated details
    const clientExpectedTotal = Number(req.body.total ?? req.body.expectedTotal);
    if (Number.isFinite(clientExpectedTotal) && clientExpectedTotal > 0) {
      const diff = Math.abs(clientExpectedTotal - finalAmount);
      if (diff > 1.0) {
        return res.status(409).json({
          success: false,
          code: "PRICE_CHANGED",
          message:
            "Item pricing or active promotional discounts have updated. Your cart total has been refreshed.",
          previousTotal: clientExpectedTotal,
          latestTotal: finalAmount,
          discountedSubtotal,
          promotionalDiscount,
          deliveryFee: serverDeliveryFee,
          handlingFee,
          discount,
        });
      }
    }

    // =======================================================
    // IDEMPOTENCY / PREVENT RAPID DUPLICATE ORDER CREATION
    // =======================================================
    const fifteenSecondsAgo = new Date(Date.now() - 15000);
    const recentDuplicateOrder = await Order.findOne({
      customerId: userId,
      createdAt: { $gte: fifteenSecondsAgo },
      "pickup.date": pickup?.date,
      "pickup.time": pickup?.time,
      total: finalAmount,
    });

    if (recentDuplicateOrder) {
      console.log(
        `Rapid duplicate order creation caught for user ${userId}. Returning existing order ${recentDuplicateOrder.orderId}`
      );
      return res.status(200).json({
        success: true,
        message: "Order already placed successfully",
        data: recentDuplicateOrder,
      });
    }

    // =======================================================
    // ONLINE PAYMENT VALIDATION (PREVENT UNPAID ONLINE ORDERS)
    // =======================================================
    let paymentStatus = "pending";
    const razorpayPaymentId =
      payment?.razorpayPaymentId || payment?.transactionId || null;
    const razorpayOrderId = payment?.razorpayOrderId || null;
    const razorpaySignature = payment?.razorpaySignature || null;

    if (payment?.method === "ONLINE") {
      if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          code: "PAYMENT_DETAILS_REQUIRED",
          message: "Payment verification details are required for online orders",
        });
      }

      // 1. Verify HMAC SHA-256 signature
      const body = razorpayOrderId + "|" + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "dummy_secret")
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({
          success: false,
          code: "INVALID_PAYMENT_SIGNATURE",
          message: "Payment signature verification failed",
        });
      }

      // 2. Replay attack prevention: Ensure paymentId is not already attached to another order
      const existingPaymentOrder = await Order.findOne({
        $or: [
          { "payment.razorpayPaymentId": razorpayPaymentId },
          { "payment.transactionId": razorpayPaymentId },
        ],
      });

      if (existingPaymentOrder) {
        return res.status(400).json({
          success: false,
          code: "PAYMENT_ALREADY_USED",
          message: "This payment has already been associated with an order",
        });
      }

      // 3. Verify payment with Razorpay API (status and amount)
      try {
        const paymentDetails = await razorpay.payments.fetch(razorpayPaymentId);
        if (
          !paymentDetails ||
          (paymentDetails.status !== "captured" && paymentDetails.status !== "authorized")
        ) {
          return res.status(400).json({
            success: false,
            code: "PAYMENT_NOT_CAPTURED",
            message: `Payment is not confirmed (status: ${paymentDetails?.status || "unknown"})`,
          });
        }

        const expectedPaise = Math.round(Number(finalAmount) * 100);
        if (Number(paymentDetails.amount) < expectedPaise) {
          return res.status(400).json({
            success: false,
            code: "PAYMENT_AMOUNT_MISMATCH",
            message: "Paid amount does not match required order total",
          });
        }
      } catch (fetchErr) {
        console.warn("Warning: Could not fetch payment details from Razorpay API:", fetchErr.message);
      }

      paymentStatus = "paid";
    }

    // =======================================================
    // ORDER ID
    // =======================================================
    const orderId =
      "ZSK" +
      Date.now() +
      Math.floor(
        Math.random() * 1000
      );

    // =======================================================
    // CREATE ORDER
    // =======================================================
    const order =
      await Order.create({
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

        promotionalDiscount,

        discount,

        coupon: appliedCoupon
          ? {
              code: appliedCoupon.code,
              discount,
            }
          : {
              code: "",
              discount: 0,
            },

        handlingFee,

        deliveryFee:
          serverDeliveryFee,

        address: {
          fullAddress:
            address.fullAddress,

          landmark:
            address.landmark,

          city:
            address.city,

          state:
            address.state,

          pincode:
            address.pincode,

          location: {
            latitude:
              Number(
                deliveryCalculation
                  .customerLocation
                  .latitude
              ),

            longitude:
              Number(
                deliveryCalculation
                  .customerLocation
                  .longitude
              ),
          },

          roadDistanceKm,

          deliveryRatePerKm,
        },

        pickup,

        payment: {
          method:
            payment?.method ||
            "COD",

          status:
            paymentStatus,

          amount:
            finalAmount,

          transactionId:
            razorpayPaymentId,

          razorpayPaymentId:
            razorpayPaymentId,

          razorpayOrderId:
            razorpayOrderId,

          razorpaySignature:
            razorpaySignature,

          paidAt:
            paymentStatus === "paid" ? new Date() : null,
        },

        meta: {
          couponCode:
            appliedCoupon?.code ||
            null,

          couponId:
            appliedCoupon?._id ||
            null,
        },

        history: [
          {
            status: "pending",

            changedAt:
              new Date(),

            note:
              paymentStatus === "paid"
                ? `Order created - Online payment verified via Razorpay (Payment ID: ${razorpayPaymentId})`
                : appliedCoupon
                ? `Order created with coupon ${appliedCoupon.code}`
                : "Order created",
          },
        ],
      });

    // =======================================================
    // AUTO SAVE CUSTOMER ADDRESS
    // =======================================================
    try {
      const customerLatitude =
        Number(
          deliveryCalculation
            .customerLocation
            .latitude
        );

      const customerLongitude =
        Number(
          deliveryCalculation
            .customerLocation
            .longitude
        );

      const existingAddress =
        await Address.findOne({
          userId:
            req.user._id,

          lat: {
            $gte:
              customerLatitude -
              0.00005,

            $lte:
              customerLatitude +
              0.00005,
          },

          lng: {
            $gte:
              customerLongitude -
              0.00005,

            $lte:
              customerLongitude +
              0.00005,
          },
        });

      // -----------------------------------------------------
      // UPDATE EXISTING ADDRESS
      // -----------------------------------------------------
      if (existingAddress) {
        existingAddress.fullName =
          address.fullName ||
          existingAddress.fullName;

        existingAddress.phone =
          address.phone ||
          existingAddress.phone;

        existingAddress.line1 =
          address.line1 ||
          address.fullAddress ||
          existingAddress.line1;

        existingAddress.line2 =
          address.line2 ||
          existingAddress.line2;

        existingAddress.landmark =
          address.landmark ||
          existingAddress.landmark;

        existingAddress.city =
          address.city ||
          existingAddress.city;

        existingAddress.state =
          address.state ||
          existingAddress.state;

        existingAddress.pincode =
          address.pincode ||
          existingAddress.pincode;

        existingAddress.lat =
          customerLatitude;

        existingAddress.lng =
          customerLongitude;

        existingAddress.location = {
          type: "Point",

          coordinates: [
            customerLongitude,
            customerLatitude,
          ],
        };

        await existingAddress.save();
      }

      // -----------------------------------------------------
      // CREATE NEW ADDRESS
      // -----------------------------------------------------
      else {
        await Address.updateMany(
          {
            userId:
              req.user._id,
          },
          {
            $set: {
              isDefault: false,
            },
          }
        );

        await Address.create({
          userId:
            req.user._id,

          fullName:
            address.fullName ||
            req.user.name,

          phone:
            address.phone ||
            req.user.phone,

          line1:
            address.line1 ||
            address.fullAddress,

          line2:
            address.line2,

          landmark:
            address.landmark,

          city:
            address.city,

          state:
            address.state,

          pincode:
            address.pincode,

          lat:
            customerLatitude,

          lng:
            customerLongitude,

          location: {
            type: "Point",

            coordinates: [
              customerLongitude,
              customerLatitude,
            ],
          },

          label:
            address.label ||
            "Home",

          isDefault: true,
        });
      }
    } catch (addressError) {
      // Address save failure must not
      // cancel a valid order.
      console.error(
        "AUTO SAVE ADDRESS ERROR:",
        addressError.message
      );
    }

    // =======================================================
    // RECORD COUPON USAGE
    // =======================================================
    if (appliedCoupon) {
      try {
        await CouponUsage.create({
  couponId: appliedCoupon._id,
  userId: order.customerId,
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
      } catch (
        couponUsageError
      ) {
        // Do not fail the order if coupon
        // usage recording has an issue.
        console.error(
          "COUPON USAGE ERROR:",
          couponUsageError.message
        );
      }
    }

    // =======================================================
    // ASYNC TELEGRAM ALERT & EMAIL VIA BULLMQ QUEUES
    // =======================================================
    const orderData = order.toObject ? order.toObject() : order;

    // Invalidate available coupons cache for customer
    await delCachePattern(`coupons:available:${userId}:*`);

    const isConfirmedOrder =
      order.payment?.method === "COD" || order.payment?.status === "paid";

    if (isConfirmedOrder) {
      // Dispatch Telegram Alert via BullMQ queue (fallback to background task if Redis offline)
      dispatchJob(
        notificationQueue,
        "send-telegram-order-alert",
        { order: orderData },
        async (data) => {
          try {
            await sendTelegramAlert(data.order);
          } catch (tgErr) {
            console.error("TELEGRAM ALERT FALLBACK ERROR:", tgErr.message);
          }
        },
        { jobId: `tg-${orderData.orderId || order._id}` }
      ).catch((err) => console.error("Error dispatching telegram job:", err.message));

      // Dispatch Confirmation Email via BullMQ queue (fallback to background task if Redis offline)
      if (order.customerEmail) {
        dispatchJob(
          emailQueue,
          "send-order-placed-email",
          { order: orderData },
          async (data) => {
            try {
              await sendEmail({
                to: data.order.customerEmail,
                from: process.env.ORDER_MAIL || process.env.MAIL_FROM,
                subject: `Your Zusko Order #${data.order.orderId} is Confirmed 🎉`,
                html: generateOrderPlacedEmail(data.order),
              });
              console.log(`Order confirmation email sent to ${data.order.customerEmail}`);
            } catch (emailErr) {
              console.error("Order confirmation email fallback failed:", emailErr.message);
            }
          },
          { jobId: `email-${orderData.orderId || order._id}` }
        ).catch((err) => console.error("Error dispatching email job:", err.message));
      }
    }

    // =======================================================
    // RESPONSE
    // =======================================================
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

      message:
        err.message ||
        "Unable to create order",
    });
  }
};


// =========================================================
// GET ORDERS BY PHONE
// =========================================================
// export const getOrdersByPhone = async (req, res) => {
//   const orders = await Order.find({
//     customerPhone: req.params.phone,
//   }).sort({ createdAt: -1 });
//
//   res.json(orders);
// };


// =========================================================
// GET DELIVERY ESTIMATE
// =========================================================
export const getDeliveryEstimate = async (
  req,
  res
) => {
  try {
    const {
      latitude,
      longitude,
      orderValue,
    } = req.body;

    if (
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null
    ) {
      return res.status(400).json({
        success: false,
        code: "LOCATION_REQUIRED",
        message:
          "Your exact location is required",
      });
    }

    const numericLatitude =
      Number(latitude);

    const numericLongitude =
      Number(longitude);

    const numericOrderValue =
      Number(orderValue);

    if (
      !Number.isFinite(
        numericLatitude
      ) ||
      !Number.isFinite(
        numericLongitude
      )
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_LOCATION",
        message:
          "Invalid location coordinates",
      });
    }

    if (
      !Number.isFinite(
        numericOrderValue
      ) ||
      numericOrderValue < 0
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ORDER_VALUE",
        message:
          "Invalid order value",
      });
    }

    const delivery =
      await calculateDelivery({
        latitude:
          numericLatitude,

        longitude:
          numericLongitude,

        orderValue:
          numericOrderValue,
      });

    return res.status(200).json({
      success: true,
      data: delivery,
    });
  } catch (error) {
    console.error(
      "DELIVERY ESTIMATE ERROR:",
      error
    );

    if (
      error.code ===
      "OUTSIDE_SERVICE_AREA"
    ) {
      return res.status(400).json({
        success: false,
        code:
          "OUTSIDE_SERVICE_AREA",
        message:
          "We are not serving in this area yet",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to calculate delivery charge",
    });
  }
};
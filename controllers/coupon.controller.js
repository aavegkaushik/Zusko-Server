import Coupon from "../models/coupon.model.js";
import CouponUsage from "../models/couponUsage.model.js";
import Order from "../models/order.model.js";

const getDiscount = (coupon, orderTotal) => {
  let discount = 0;

  if (coupon.discountType === "flat") {
    discount = coupon.discountValue;
  }

  if (coupon.discountType === "percentage") {
    discount =
      (orderTotal * coupon.discountValue) / 100;
  }

  if (
    coupon.maxDiscount !== null &&
    discount > coupon.maxDiscount
  ) {
    discount = coupon.maxDiscount;
  }

  return Math.min(discount, orderTotal);
};

const checkEligibility = async (
  coupon,
  user,
  orderTotal,
  items = []
) => {
  const now = new Date();

  if (!coupon.isActive) {
    return {
      eligible: false,
      message: "Coupon is inactive",
    };
  }

  if (
    coupon.validFrom &&
    now < coupon.validFrom
  ) {
    return {
      eligible: false,
      message: "Coupon is not active yet",
    };
  }

  if (
    coupon.validUntil &&
    now > coupon.validUntil
  ) {
    return {
      eligible: false,
      message: "Coupon has expired",
    };
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    return {
      eligible: false,
      message: "Coupon usage limit reached",
    };
  }

  if (orderTotal < coupon.minOrderValue) {
    return {
      eligible: false,
      message: `Minimum order ₹${coupon.minOrderValue} required`,
    };
  }

  // Specific users
  if (coupon.applicableUsers.length > 0) {
    const allowed = coupon.applicableUsers.some(
      (id) =>
        id.toString() === user._id.toString()
    );

    if (!allowed) {
      return {
        eligible: false,
        message: "Coupon is not available for you",
      };
    }
  }

  // First order
  if (coupon.firstOrderOnly || coupon.newUsersOnly) {
    const orderCount = await Order.countDocuments({
      customerId: user._id,
      status: { $ne: "cancelled" },
    });

    if (orderCount > 0) {
      return {
        eligible: false,
        message: "Coupon is only for your first order",
      };
    }
  }

  // Per user usage
  const usageCount = await CouponUsage.countDocuments({
    couponId: coupon._id,
    userId: user._id,
    status: "used",
  });

  if (usageCount >= coupon.perUserLimit) {
    return {
      eligible: false,
      message: "You have already used this coupon",
    };
  }

  // Service validation
  if (
    coupon.applicableServices.length > 0
  ) {
    const hasAllowedService = items.some(
      (item) =>
        coupon.applicableServices.includes(
          item.service
        )
    );

    if (!hasAllowedService) {
      return {
        eligible: false,
        message: "Coupon is not valid for these services",
      };
    }
  }

  const discount = getDiscount(
    coupon,
    orderTotal
  );

  return {
    eligible: true,
    discount,
  };
};

// GET AVAILABLE COUPONS
export const getAvailableCoupons = async (req, res) => {
  try {
    const user = req.user;

    const total = Number(req.query.total || 0);

    const coupons = await Coupon.find({
      isActive: true,
    }).sort({
      autoApply: -1,
      createdAt: -1,
    });

    const result = [];

    for (const coupon of coupons) {
      const eligibility = await checkEligibility(
        coupon,
        user,
        total,
        []
      );

      result.push({
        id: coupon._id,

        code: coupon.code,

        title: coupon.title,

        description: coupon.description,

        discountType: coupon.discountType,

        discountValue: coupon.discountValue,

        maxDiscount: coupon.maxDiscount,

        minOrderValue: coupon.minOrderValue,

        discount: eligibility.eligible
          ? eligibility.discount
          : 0,

        autoApply: coupon.autoApply,

        // ==========================================
        // ELIGIBILITY
        // ==========================================

        eligible: eligibility.eligible,

        // Why coupon is locked
        message: eligibility.eligible
          ? null
          : eligibility.message,

        // ==========================================
        // USER TYPE RESTRICTIONS
        // ==========================================

        // 🔥 First-order coupon
        firstOrderOnly:
          coupon.firstOrderOnly,

        // 🔥 New-user coupon
        newUsersOnly:
          coupon.newUsersOnly,

        // ==========================================
        // VALIDITY
        // ==========================================

        validFrom: coupon.validFrom,

        validUntil: coupon.validUntil,
      });
    }

    return res.json({
      success: true,
      coupons: result,
    });
  } catch (error) {
    console.error(
      "GET AVAILABLE COUPONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch coupons",
    });
  }
};

// VALIDATE COUPON
export const validateCoupon = async (
  req,
  res
) => {
  try {
    const user = req.user;

    const {
      code,
      total,
      items = [],
    } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const coupon = await Coupon.findOne({
      code: code.toUpperCase().trim(),
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid coupon",
      });
    }

    const result =
      await checkEligibility(
        coupon,
        user,
        Number(total || 0),
        items
      );

    if (!result.eligible) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        discount: result.discount,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      message: "Coupon is valid",
    });
  } catch (error) {
    console.error(
      "VALIDATE COUPON ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Unable to validate coupon",
    });
  }
};

export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      maxDiscount,
      minOrderValue,
      usageLimit,
      perUserLimit,
      firstOrderOnly,
      newUsersOnly,
      applicableServices,
      applicablePaymentMethods,
      applicableUsers,
      validFrom,
      validUntil,
      isActive,
      autoApply,
    } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const existing = await Coupon.findOne({
      code: code.trim().toUpperCase(),
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Coupon already exists",
      });
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),

      title: title || "",

      description: description || "",

      discountType,

      discountValue,

      maxDiscount:
        maxDiscount === null ||
        maxDiscount === undefined ||
        maxDiscount === ""
          ? null
          : Number(maxDiscount),

      minOrderValue:
        Number(minOrderValue || 0),

      usageLimit:
        usageLimit === null ||
        usageLimit === undefined ||
        usageLimit === ""
          ? null
          : Number(usageLimit),

      perUserLimit:
        Number(perUserLimit || 1),

      firstOrderOnly:
        Boolean(firstOrderOnly),

      newUsersOnly:
        Boolean(newUsersOnly),

      applicableServices:
        applicableServices || [],

      applicablePaymentMethods:
        applicablePaymentMethods || [],

      applicableUsers:
        applicableUsers || [],

      validFrom:
        validFrom || new Date(),

      validUntil:
        validUntil || null,

      isActive:
        isActive !== false,

      autoApply:
        Boolean(autoApply),
    });

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    console.error(
      "CREATE COUPON ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
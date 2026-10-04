import Coupon from "../models/coupon.model.js";
import CouponUsage from "../models/couponUsage.model.js";
import Order from "../models/order.model.js";

// ============================================================
// CONSTANTS
// ============================================================

const SERVICES = [
  "Wash & Fold",
  "Wash & Iron",
  "Dry Clean",
  "Steam Iron",
  "Commercial Laundry",
];

const PAYMENT_METHODS = [
  "cod",
  "razorpay",
  "upi",
  "card",
  "wallet",
];

// ============================================================
// HELPERS
// ============================================================

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const normalizeArray = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(Boolean)
    .map((item) =>
      typeof item === "string"
        ? item.trim()
        : item
    );
};

const getOrderStats = async (userId) => {
  const orders = await Order.find({
    customerId: userId,
    status: { $ne: "cancelled" },
  })
    .select("total createdAt status")
    .lean();

  const orderCount = orders.length;

  const lifetimeSpend = orders.reduce(
    (sum, order) =>
      sum + toNumber(order.total, 0),
    0
  );

  const lastOrder = orders.reduce(
    (latest, order) => {
      if (!order.createdAt) return latest;

      if (
        !latest ||
        new Date(order.createdAt) >
          new Date(latest)
      ) {
        return order.createdAt;
      }

      return latest;
    },
    null
  );

  return {
    orderCount,
    lifetimeSpend,
    lastOrder,
  };
};

// ============================================================
// SERVICE SUBTOTAL
// ============================================================

const getApplicableServiceSubtotal = (
  coupon,
  items = []
) => {
  const services =
    normalizeArray(
      coupon.applicableServices
    );

  if (services.length === 0) {
    return {
      valid: true,
      subtotal: 0,
      matchingItems: [],
    };
  }

  const matchingItems = items.filter(
    (item) =>
      services.includes(item?.service)
  );

  if (matchingItems.length === 0) {
    return {
      valid: false,
      subtotal: 0,
      matchingItems: [],
    };
  }

  // ANY
  if (
    coupon.serviceMatchMode === "ANY"
  ) {
    const subtotal =
      matchingItems.reduce(
        (sum, item) =>
          sum +
          toNumber(item.price) *
            toNumber(item.qty, 1),
        0
      );

    return {
      valid: true,
      subtotal,
      matchingItems,
    };
  }

  // ALL
  const cartServices = new Set(
    matchingItems.map(
      (item) => item.service
    )
  );

  const allServicesPresent =
    services.every((service) =>
      cartServices.has(service)
    );

  if (!allServicesPresent) {
    return {
      valid: false,
      subtotal: 0,
      matchingItems,
    };
  }

  const subtotal =
    matchingItems.reduce(
      (sum, item) =>
        sum +
        toNumber(item.price) *
          toNumber(item.qty, 1),
      0
    );

  return {
    valid: true,
    subtotal,
    matchingItems,
  };
};

// ============================================================
// DISCOUNT CALCULATION
// ============================================================

const calculateDiscount = (
  coupon,
  orderTotal,
  items = []
) => {
  let discountBase = orderTotal;

  // Selected-service coupon
  if (
    coupon.discountScope ===
    "selected_services" &&
    coupon.applicableServices?.length > 0
  ) {
    const serviceResult =
      getApplicableServiceSubtotal(
        coupon,
        items
      );

    if (!serviceResult.valid) {
      return 0;
    }

    discountBase =
      serviceResult.subtotal;
  }

  let discount = 0;

  if (coupon.discountType === "flat") {
    discount = coupon.discountValue;
  }

  if (
    coupon.discountType ===
    "percentage"
  ) {
    discount =
      (discountBase *
        coupon.discountValue) /
      100;
  }

  if (
    coupon.maxDiscount !== null &&
    coupon.maxDiscount !== undefined &&
    discount > coupon.maxDiscount
  ) {
    discount = coupon.maxDiscount;
  }

  return Math.max(
    0,
    Math.min(discount, discountBase)
  );
};

// ============================================================
// USER AUDIENCE
// ============================================================

const checkAudienceEligibility =
  async (coupon, user) => {
    const audience =
      coupon.audienceType ||
      "everyone";

    const stats =
      await getOrderStats(user._id);

    // --------------------------------------------------------
    // SPECIFIC USERS
    // --------------------------------------------------------

    if (audience === "specific_users") {
      const allowed =
        coupon.applicableUsers?.some(
          (id) =>
            id.toString() ===
            user._id.toString()
        );

      if (!allowed) {
        return {
          eligible: false,
          reason: "USER_NOT_TARGETED",
          message:
            "Coupon is not available for you",
        };
      }

      return {
        eligible: true,
        stats,
      };
    }

    // --------------------------------------------------------
    // EVERYONE
    // --------------------------------------------------------

    if (audience === "everyone") {
      return {
        eligible: true,
        stats,
      };
    }

    // --------------------------------------------------------
    // FIRST ORDER
    // --------------------------------------------------------

    if (
      audience === "first_order" ||
      coupon.firstOrderOnly
    ) {
      if (stats.orderCount > 0) {
        return {
          eligible: false,
          reason: "FIRST_ORDER_ONLY",
          message:
            "Coupon is only for your first order",
        };
      }
    }

    // --------------------------------------------------------
    // NEW USERS
    // --------------------------------------------------------

    if (
      audience === "new_users" ||
      coupon.newUsersOnly
    ) {
      if (stats.orderCount > 0) {
        return {
          eligible: false,
          reason: "NEW_USERS_ONLY",
          message:
            "Coupon is only available for new users",
        };
      }
    }

    // --------------------------------------------------------
    // EXISTING USERS
    // --------------------------------------------------------

    if (audience === "existing_users") {
      if (stats.orderCount <= 0) {
        return {
          eligible: false,
          reason: "EXISTING_USERS_ONLY",
          message:
            "Coupon is only available for existing users",
        };
      }
    }

    // --------------------------------------------------------
    // INACTIVE USERS
    // --------------------------------------------------------

    if (audience === "inactive_users") {
      const inactiveDays =
        toNumber(
          coupon.inactiveDays,
          30
        );

      if (!stats.lastOrder) {
        return {
          eligible: false,
          reason: "NOT_INACTIVE",
          message:
            "Coupon is not available for your account",
        };
      }

      const inactiveSince =
        new Date(
          Date.now() -
            inactiveDays *
              24 *
              60 *
              60 *
              1000
        );

      if (
        new Date(stats.lastOrder) >
        inactiveSince
      ) {
        return {
          eligible: false,
          reason: "NOT_INACTIVE",
          message: `Coupon is for users inactive for ${inactiveDays}+ days`,
        };
      }
    }

    // --------------------------------------------------------
    // ORDER COUNT
    // --------------------------------------------------------

    if (audience === "order_count") {
      if (
        coupon.minOrders !== null &&
        stats.orderCount <
          coupon.minOrders
      ) {
        return {
          eligible: false,
          reason: "MIN_ORDER_COUNT",
          message: `Minimum ${coupon.minOrders} completed orders required`,
        };
      }

      if (
        coupon.maxOrders !== null &&
        stats.orderCount >
          coupon.maxOrders
      ) {
        return {
          eligible: false,
          reason: "MAX_ORDER_COUNT",
          message: `Coupon is only available up to ${coupon.maxOrders} orders`,
        };
      }
    }

    // --------------------------------------------------------
    // LIFETIME SPEND
    // --------------------------------------------------------

    if (
      audience === "lifetime_spend"
    ) {
      if (
        coupon.minLifetimeSpend !==
          null &&
        stats.lifetimeSpend <
          coupon.minLifetimeSpend
      ) {
        return {
          eligible: false,
          reason: "MIN_LIFETIME_SPEND",
          message: `Minimum lifetime spend ₹${coupon.minLifetimeSpend} required`,
        };
      }

      if (
        coupon.maxLifetimeSpend !==
          null &&
        stats.lifetimeSpend >
          coupon.maxLifetimeSpend
      ) {
        return {
          eligible: false,
          reason: "MAX_LIFETIME_SPEND",
          message: `Coupon is not available for users above ₹${coupon.maxLifetimeSpend} lifetime spend`,
        };
      }
    }

    return {
      eligible: true,
      stats,
    };
  };

// ============================================================
// MAIN ELIGIBILITY ENGINE
// ============================================================

export const checkEligibility =
  async (
    coupon,
    user,
    orderTotal,
    items = [],
    paymentMethod = null
  ) => {
    const now = new Date();

    const total = toNumber(
      orderTotal,
      0
    );

    // --------------------------------------------------------
    // ACTIVE
    // --------------------------------------------------------

    if (!coupon.isActive) {
      return {
        eligible: false,
        reason: "INACTIVE",
        message:
          "Coupon is inactive",
      };
    }

    // --------------------------------------------------------
    // VALID FROM
    // --------------------------------------------------------

    if (
      coupon.validFrom &&
      now < new Date(coupon.validFrom)
    ) {
      return {
        eligible: false,
        reason: "NOT_STARTED",
        message:
          "Coupon is not active yet",
      };
    }

    // --------------------------------------------------------
    // VALID UNTIL
    // --------------------------------------------------------

    if (
      coupon.validUntil &&
      now >
        new Date(coupon.validUntil)
    ) {
      return {
        eligible: false,
        reason: "EXPIRED",
        message:
          "Coupon has expired",
      };
    }

    // --------------------------------------------------------
    // GLOBAL USAGE LIMIT
    // --------------------------------------------------------

    if (
      coupon.usageLimit !== null &&
      coupon.usedCount >=
        coupon.usageLimit
    ) {
      return {
        eligible: false,
        reason: "USAGE_LIMIT",
        message:
          "Coupon usage limit reached",
      };
    }

    // --------------------------------------------------------
    // MIN ORDER
    // --------------------------------------------------------

    if (
      total <
      toNumber(
        coupon.minOrderValue,
        0
      )
    ) {
      return {
        eligible: false,
        reason: "MIN_ORDER_VALUE",
        message: `Minimum order ₹${coupon.minOrderValue} required`,
      };
    }

    // --------------------------------------------------------
    // MAX ORDER
    // --------------------------------------------------------

    if (
      coupon.maxOrderValue !== null &&
      total >
        coupon.maxOrderValue
    ) {
      return {
        eligible: false,
        reason: "MAX_ORDER_VALUE",
        message: `Coupon is available only on orders up to ₹${coupon.maxOrderValue}`,
      };
    }

    // --------------------------------------------------------
    // USER TARGETING
    // --------------------------------------------------------

    const audienceResult =
      await checkAudienceEligibility(
        coupon,
        user
      );

    if (!audienceResult.eligible) {
      return audienceResult;
    }

    // --------------------------------------------------------
    // PER USER USAGE
    // --------------------------------------------------------

    const usageCount =
      await CouponUsage.countDocuments({
        couponId: coupon._id,
        userId: user._id,
        status: "used",
      });

    if (
      usageCount >=
      toNumber(
        coupon.perUserLimit,
        1
      )
    ) {
      return {
        eligible: false,
        reason: "ALREADY_USED",
        message:
          "You have already used this coupon",
      };
    }

    // --------------------------------------------------------
    // PAYMENT METHOD
    // --------------------------------------------------------

    const paymentMethods =
      normalizeArray(
        coupon.applicablePaymentMethods
      );

    if (
      paymentMethods.length > 0 &&
      paymentMethod
    ) {
      const normalizedPayment =
        String(paymentMethod)
          .toLowerCase()
          .trim();

      const allowed =
        paymentMethods.some(
          (method) =>
            String(method)
              .toLowerCase()
              .trim() ===
            normalizedPayment
        );

      if (!allowed) {
        return {
          eligible: false,
          reason: "PAYMENT_METHOD",
          message:
            "Coupon is not valid for this payment method",
        };
      }
    }

    // --------------------------------------------------------
    // SERVICE
    // --------------------------------------------------------

    if (
      coupon.applicableServices?.length >
      0
    ) {
      const serviceResult =
        getApplicableServiceSubtotal(
          coupon,
          items
        );

      if (!serviceResult.valid) {
        return {
          eligible: false,
          reason:
            coupon.serviceMatchMode ===
            "ALL"
              ? "ALL_SERVICES_REQUIRED"
              : "SERVICE_NOT_APPLICABLE",
          message:
            coupon.serviceMatchMode ===
            "ALL"
              ? `This coupon requires: ${coupon.applicableServices.join(
                  ", "
                )}`
              : "Coupon is not valid for these services",
        };
      }

      // Service-specific minimum
      if (
        coupon.minServiceValue >
          0 &&
        serviceResult.subtotal <
          coupon.minServiceValue
      ) {
        return {
          eligible: false,
          reason:
            "MIN_SERVICE_VALUE",
          message: `Minimum ₹${coupon.minServiceValue} required on selected service${coupon.serviceMatchMode === "ALL" ? "s" : ""}`,
          serviceSubtotal:
            serviceResult.subtotal,
          minServiceValue:
            coupon.minServiceValue,
        };
      }
    }

    // --------------------------------------------------------
    // DISCOUNT
    // --------------------------------------------------------

    const discount =
      calculateDiscount(
        coupon,
        total,
        items
      );

    if (discount <= 0) {
      return {
        eligible: false,
        reason: "NO_DISCOUNT",
        message:
          "Coupon does not provide a discount on this order",
      };
    }

    return {
      eligible: true,
      reason: null,
      message: null,
      discount,
      stats:
        audienceResult.stats,
    };
  };

// ============================================================
// FORMAT COUPON RESPONSE
// ============================================================

const formatCoupon = (
  coupon,
  eligibility
) => ({
  id: coupon._id,

  code: coupon.code,

  title: coupon.title,

  description:
    coupon.description,

  discountType:
    coupon.discountType,

  discountValue:
    coupon.discountValue,

  maxDiscount:
    coupon.maxDiscount,

  minOrderValue:
    coupon.minOrderValue,

  maxOrderValue:
    coupon.maxOrderValue,

  discountScope:
    coupon.discountScope,

  applicableServices:
    coupon.applicableServices,

  serviceMatchMode:
    coupon.serviceMatchMode,

  minServiceValue:
    coupon.minServiceValue,

  applicablePaymentMethods:
    coupon.applicablePaymentMethods,

  audienceType:
    coupon.audienceType,

  minOrders:
    coupon.minOrders,

  maxOrders:
    coupon.maxOrders,

  minLifetimeSpend:
    coupon.minLifetimeSpend,

  maxLifetimeSpend:
    coupon.maxLifetimeSpend,

  inactiveDays:
    coupon.inactiveDays,

  usageLimit:
    coupon.usageLimit,

  usedCount:
    coupon.usedCount,

  perUserLimit:
    coupon.perUserLimit,

  discount:
    eligibility?.eligible
      ? eligibility.discount
      : 0,

  autoApply:
    coupon.autoApply,

  eligible:
    Boolean(
      eligibility?.eligible
    ),

  message:
    eligibility?.eligible
      ? null
      : eligibility?.message,

  reason:
    eligibility?.reason || null,

  firstOrderOnly:
    coupon.firstOrderOnly,

  newUsersOnly:
    coupon.newUsersOnly,

  validFrom:
    coupon.validFrom,

  validUntil:
    coupon.validUntil,

  isActive:
    coupon.isActive,

  createdAt:
    coupon.createdAt,

  updatedAt:
    coupon.updatedAt,
});

// ============================================================
// GET AVAILABLE COUPONS
// ============================================================

export const getAvailableCoupons =
  async (req, res) => {
    try {
      const user = req.user;

      const total = toNumber(
        req.query.total,
        0
      );

      let items = [];

      try {
        if (req.query.items) {
          items = JSON.parse(
            req.query.items
          );
        }
      } catch (error) {
        console.error(
          "COUPON ITEMS PARSE ERROR:",
          error
        );

        items = [];
      }

      const paymentMethod =
        req.query.paymentMethod ||
        null;

      const coupons =
        await Coupon.find({
          isActive: true,
        }).sort({
          autoApply: -1,
          createdAt: -1,
        });

      const result = [];

      for (const coupon of coupons) {
        const eligibility =
          await checkEligibility(
            coupon,
            user,
            total,
            items,
            paymentMethod
          );

        // Already-used coupons should
        // NEVER appear in available list.
        if (
          eligibility.reason ===
          "ALREADY_USED"
        ) {
          continue;
        }

        result.push(
          formatCoupon(
            coupon,
            eligibility
          )
        );
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
        message:
          "Failed to fetch available coupons",
        error: error.message,
      });
    }
  };

// ============================================================
// VALIDATE COUPON
// ============================================================

export const validateCoupon =
  async (req, res) => {
    try {
      const user = req.user;

      const {
        code,
        total,
        items = [],
        paymentMethod = null,
      } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message:
            "Coupon code is required",
        });
      }

      const coupon =
        await Coupon.findOne({
          code: String(code)
            .toUpperCase()
            .trim(),
        });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Invalid coupon",
        });
      }

      const result =
        await checkEligibility(
          coupon,
          user,
          toNumber(total, 0),
          items,
          paymentMethod
        );

      if (!result.eligible) {
        return res.status(400).json({
          success: false,
          message:
            result.message,
          reason:
            result.reason,
        });
      }

      return res.json({
        success: true,

        coupon: {
          id: coupon._id,

          code: coupon.code,

          discount:
            result.discount,

          discountType:
            coupon.discountType,

          discountValue:
            coupon.discountValue,

          discountScope:
            coupon.discountScope,

          applicableServices:
            coupon.applicableServices,

          serviceMatchMode:
            coupon.serviceMatchMode,

          minServiceValue:
            coupon.minServiceValue,
        },

        message:
          "Coupon is valid",
      });
    } catch (error) {
      console.error(
        "VALIDATE COUPON ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to validate coupon",
      });
    }
  };

// ============================================================
// CREATE COUPON
// ============================================================

export const createCoupon =
  async (req, res) => {
    try {
      const body = req.body;

      const code = String(
        body.code || ""
      )
        .trim()
        .toUpperCase();

      if (!code) {
        return res.status(400).json({
          success: false,
          message:
            "Coupon code is required",
        });
      }

      const existing =
        await Coupon.findOne({
          code,
        });

      if (existing) {
        return res.status(409).json({
          success: false,
          message:
            "Coupon already exists",
        });
      }

      const discountType =
        body.discountType;

      if (
        !["flat", "percentage"].includes(
          discountType
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid discount type",
        });
      }

      const discountValue =
        toNumber(
          body.discountValue,
          -1
        );

      if (discountValue < 0) {
        return res.status(400).json({
          success: false,
          message:
            "Discount value must be valid",
        });
      }

      if (
        discountType ===
          "percentage" &&
        discountValue > 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Percentage discount cannot exceed 100%",
        });
      }

      const coupon =
        await Coupon.create({
          code,

          title:
            body.title || "",

          description:
            body.description || "",

          discountType,

          discountValue,

          maxDiscount:
            body.maxDiscount ===
              "" ||
            body.maxDiscount === null ||
            body.maxDiscount ===
              undefined
              ? null
              : toNumber(
                  body.maxDiscount
                ),

          minOrderValue:
            toNumber(
              body.minOrderValue,
              0
            ),

          maxOrderValue:
            body.maxOrderValue ===
              "" ||
            body.maxOrderValue === null ||
            body.maxOrderValue ===
              undefined
              ? null
              : toNumber(
                  body.maxOrderValue
                ),

          usageLimit:
            body.usageLimit ===
              "" ||
            body.usageLimit === null ||
            body.usageLimit ===
              undefined
              ? null
              : toNumber(
                  body.usageLimit
                ),

          perUserLimit:
            Math.max(
              1,
              toNumber(
                body.perUserLimit,
                1
              )
            ),

          applicableServices:
            normalizeArray(
              body.applicableServices
            ),

          serviceMatchMode:
            body.serviceMatchMode ===
            "ALL"
              ? "ALL"
              : "ANY",

          minServiceValue:
            toNumber(
              body.minServiceValue,
              0
            ),

          discountScope:
            body.discountScope ===
            "selected_services"
              ? "selected_services"
              : "order",

          applicablePaymentMethods:
            normalizeArray(
              body.applicablePaymentMethods
            ),

          audienceType:
            body.audienceType ||
            "everyone",

          applicableUsers:
            normalizeArray(
              body.applicableUsers
            ),

          minOrders:
            body.minOrders ===
              "" ||
            body.minOrders === null ||
            body.minOrders ===
              undefined
              ? null
              : toNumber(
                  body.minOrders
                ),

          maxOrders:
            body.maxOrders ===
              "" ||
            body.maxOrders === null ||
            body.maxOrders ===
              undefined
              ? null
              : toNumber(
                  body.maxOrders
                ),

          minLifetimeSpend:
            body.minLifetimeSpend ===
              "" ||
            body.minLifetimeSpend ===
              null ||
            body.minLifetimeSpend ===
              undefined
              ? null
              : toNumber(
                  body.minLifetimeSpend
                ),

          maxLifetimeSpend:
            body.maxLifetimeSpend ===
              "" ||
            body.maxLifetimeSpend ===
              null ||
            body.maxLifetimeSpend ===
              undefined
              ? null
              : toNumber(
                  body.maxLifetimeSpend
                ),

          inactiveDays:
            Math.max(
              1,
              toNumber(
                body.inactiveDays,
                30
              )
            ),

          firstOrderOnly:
            Boolean(
              body.firstOrderOnly
            ),

          newUsersOnly:
            Boolean(
              body.newUsersOnly
            ),

          validFrom:
            body.validFrom ||
            new Date(),

          validUntil:
            body.validUntil ||
            null,

          isActive:
            body.isActive !== false,

          autoApply:
            Boolean(
              body.autoApply
            ),
        });

      return res.status(201).json({
        success: true,
        message:
          "Coupon created successfully",
        coupon,
      });
    } catch (error) {
      console.error(
        "CREATE COUPON ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// ============================================================
// GET ALL COUPONS - ADMIN
// ============================================================

export const getAdminCoupons =
  async (req, res) => {
    try {
      const coupons =
        await Coupon.find({})
          .populate(
            "applicableUsers",
            "name email phone"
          )
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.json({
        success: true,
        coupons,
      });
    } catch (error) {
      console.error(
        "GET ADMIN COUPONS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch coupons",
      });
    }
  };

// ============================================================
// GET SINGLE COUPON - ADMIN
// ============================================================

export const getAdminCoupon =
  async (req, res) => {
    try {
      const coupon =
        await Coupon.findById(
          req.params.id
        ).populate(
          "applicableUsers",
          "name email phone"
        );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Coupon not found",
        });
      }

      return res.json({
        success: true,
        coupon,
      });
    } catch (error) {
      console.error(
        "GET ADMIN COUPON ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch coupon",
      });
    }
  };

// ============================================================
// UPDATE COUPON - ADMIN
// ============================================================

export const updateCoupon =
  async (req, res) => {
    try {
      const coupon =
        await Coupon.findById(
          req.params.id
        );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Coupon not found",
        });
      }

      const body = req.body;

      if (body.code !== undefined) {
        const code = String(
          body.code
        )
          .trim()
          .toUpperCase();

        const duplicate =
          await Coupon.findOne({
            code,
            _id: {
              $ne: coupon._id,
            },
          });

        if (duplicate) {
          return res.status(409).json({
            success: false,
            message:
              "Coupon code already exists",
          });
        }

        coupon.code = code;
      }

      if (
        body.title !== undefined
      ) {
        coupon.title =
          body.title;
      }

      if (
        body.description !==
        undefined
      ) {
        coupon.description =
          body.description;
      }

      if (
        body.discountType !==
        undefined
      ) {
        coupon.discountType =
          body.discountType;
      }

      if (
        body.discountValue !==
        undefined
      ) {
        coupon.discountValue =
          toNumber(
            body.discountValue
          );
      }

      const nullableNumbers = [
        "maxDiscount",
        "maxOrderValue",
        "usageLimit",
        "minOrders",
        "maxOrders",
        "minLifetimeSpend",
        "maxLifetimeSpend",
      ];

      for (const field of nullableNumbers) {
        if (
          body[field] !== undefined
        ) {
          coupon[field] =
            body[field] ===
              "" ||
            body[field] === null
              ? null
              : toNumber(
                  body[field]
                );
        }
      }

      if (
        body.minOrderValue !==
        undefined
      ) {
        coupon.minOrderValue =
          toNumber(
            body.minOrderValue
          );
      }

      if (
        body.perUserLimit !==
        undefined
      ) {
        coupon.perUserLimit =
          Math.max(
            1,
            toNumber(
              body.perUserLimit,
              1
            )
          );
      }

      if (
        body.applicableServices !==
        undefined
      ) {
        coupon.applicableServices =
          normalizeArray(
            body.applicableServices
          );
      }

      if (
        body.serviceMatchMode !==
        undefined
      ) {
        coupon.serviceMatchMode =
          body.serviceMatchMode ===
          "ALL"
            ? "ALL"
            : "ANY";
      }

      if (
        body.minServiceValue !==
        undefined
      ) {
        coupon.minServiceValue =
          toNumber(
            body.minServiceValue
          );
      }

      if (
        body.discountScope !==
        undefined
      ) {
        coupon.discountScope =
          body.discountScope ===
          "selected_services"
            ? "selected_services"
            : "order";
      }

      if (
        body.applicablePaymentMethods !==
        undefined
      ) {
        coupon.applicablePaymentMethods =
          normalizeArray(
            body.applicablePaymentMethods
          );
      }

      if (
        body.audienceType !==
        undefined
      ) {
        coupon.audienceType =
          body.audienceType;
      }

      if (
        body.applicableUsers !==
        undefined
      ) {
        coupon.applicableUsers =
          normalizeArray(
            body.applicableUsers
          );
      }

      if (
        body.inactiveDays !==
        undefined
      ) {
        coupon.inactiveDays =
          Math.max(
            1,
            toNumber(
              body.inactiveDays,
              30
            )
          );
      }

      if (
        body.firstOrderOnly !==
        undefined
      ) {
        coupon.firstOrderOnly =
          Boolean(
            body.firstOrderOnly
          );
      }

      if (
        body.newUsersOnly !==
        undefined
      ) {
        coupon.newUsersOnly =
          Boolean(
            body.newUsersOnly
          );
      }

      if (
        body.validFrom !==
        undefined
      ) {
        coupon.validFrom =
          body.validFrom;
      }

      if (
        body.validUntil !==
        undefined
      ) {
        coupon.validUntil =
          body.validUntil || null;
      }

      if (
        body.isActive !==
        undefined
      ) {
        coupon.isActive =
          Boolean(
            body.isActive
          );
      }

      if (
        body.autoApply !==
        undefined
      ) {
        coupon.autoApply =
          Boolean(
            body.autoApply
          );
      }

      await coupon.save();

      return res.json({
        success: true,
        message:
          "Coupon updated successfully",
        coupon,
      });
    } catch (error) {
      console.error(
        "UPDATE COUPON ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// ============================================================
// TOGGLE COUPON
// ============================================================

export const toggleCoupon =
  async (req, res) => {
    try {
      const coupon =
        await Coupon.findById(
          req.params.id
        );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Coupon not found",
        });
      }

      coupon.isActive =
        !coupon.isActive;

      await coupon.save();

      return res.json({
        success: true,
        message: coupon.isActive
          ? "Coupon activated"
          : "Coupon deactivated",
        coupon,
      });
    } catch (error) {
      console.error(
        "TOGGLE COUPON ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update coupon status",
      });
    }
  };

// ============================================================
// DELETE COUPON
// ============================================================

export const deleteCoupon =
  async (req, res) => {
    try {
      const coupon =
        await Coupon.findById(
          req.params.id
        );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Coupon not found",
        });
      }

      await Coupon.deleteOne({
        _id: coupon._id,
      });

      return res.json({
        success: true,
        message:
          "Coupon deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE COUPON ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to delete coupon",
      });
    }
  };

// ============================================================
// COUPON USAGE - ADMIN
// ============================================================

export const getCouponUsage =
  async (req, res) => {
    try {
      const usage =
        await CouponUsage.find({
          couponId:
            req.params.id,
        })
          .populate(
            "userId",
            "name email phone"
          )
          .populate(
            "orderId",
            "orderId total status"
          )
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.json({
        success: true,
        usage,
      });
    } catch (error) {
      console.error(
        "GET COUPON USAGE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch coupon usage",
      });
    }
  };

// ============================================================
// COUPON ANALYTICS - ADMIN
// ============================================================

export const getCouponAnalytics =
  async (req, res) => {
    try {
      const [
        totalCoupons,
        activeCoupons,
        usageStats,
      ] = await Promise.all([
        Coupon.countDocuments({}),

        Coupon.countDocuments({
          isActive: true,
        }),

        CouponUsage.aggregate([
          {
            $match: {
              status: "used",
            },
          },
          {
            $group: {
              _id: null,
              totalUses: {
                $sum: 1,
              },
              totalDiscount: {
                $sum: "$discountAmount",
              },
            },
          },
        ]),
      ]);

      const stats =
        usageStats[0] || {
          totalUses: 0,
          totalDiscount: 0,
        };

      return res.json({
        success: true,
        analytics: {
          totalCoupons,
          activeCoupons,
          totalUses:
            stats.totalUses,
          totalDiscount:
            stats.totalDiscount,
        },
      });
    } catch (error) {
      console.error(
        "COUPON ANALYTICS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch coupon analytics",
      });
    }
  };
import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    // ============================================================
    // BASIC
    // ============================================================

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    title: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // ============================================================
    // DISCOUNT
    // ============================================================

    discountType: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    maxDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    // ============================================================
    // ORDER CONDITIONS
    // ============================================================

    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxOrderValue: {
      type: Number,
      default: null,
      min: 0,
    },

    // ============================================================
    // SERVICE CONDITIONS
    // ============================================================

    applicableServices: {
      type: [String],
      default: [],
    },

    serviceMatchMode: {
      type: String,
      enum: ["ANY", "ALL"],
      default: "ANY",
    },

    minServiceValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * order
     *  -> discount calculated on complete order
     *
     * selected_services
     *  -> discount calculated only on applicable services
     */
    discountScope: {
      type: String,
      enum: ["order", "selected_services"],
      default: "order",
    },

    // ============================================================
    // PAYMENT
    // ============================================================

    applicablePaymentMethods: {
      type: [String],
      default: [],
    },

    // ============================================================
    // USER TARGETING
    // ============================================================

    audienceType: {
      type: String,
      enum: [
        "everyone",
        "first_order",
        "new_users",
        "existing_users",
        "inactive_users",
        "specific_users",
        "order_count",
        "lifetime_spend",
      ],
      default: "everyone",
    },

    applicableUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    /**
     * Used when audienceType = order_count
     */
    minOrders: {
      type: Number,
      default: null,
      min: 0,
    },

    maxOrders: {
      type: Number,
      default: null,
      min: 0,
    },

    /**
     * Used when audienceType = lifetime_spend
     */
    minLifetimeSpend: {
      type: Number,
      default: null,
      min: 0,
    },

    maxLifetimeSpend: {
      type: Number,
      default: null,
      min: 0,
    },

    /**
     * Used when audienceType = inactive_users.
     *
     * Example:
     * inactiveDays = 30
     * means user has not placed an order in last 30 days.
     */
    inactiveDays: {
      type: Number,
      default: 30,
      min: 1,
    },

    // ============================================================
    // USAGE
    // ============================================================

    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    perUserLimit: {
      type: Number,
      default: 1,
      min: 1,
    },

    // ============================================================
    // LEGACY / QUICK TARGETING FLAGS
    // ============================================================

    firstOrderOnly: {
      type: Boolean,
      default: false,
    },

    newUsersOnly: {
      type: Boolean,
      default: false,
    },

    // ============================================================
    // VALIDITY
    // ============================================================

    validFrom: {
      type: Date,
      default: Date.now,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    // ============================================================
    // STATUS
    // ============================================================

    isActive: {
      type: Boolean,
      default: true,
    },

    autoApply: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// INDEXES
// ============================================================

couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({
  validFrom: 1,
  validUntil: 1,
});

couponSchema.index({
  audienceType: 1,
  isActive: 1,
});

export default mongoose.model("Coupon", couponSchema);
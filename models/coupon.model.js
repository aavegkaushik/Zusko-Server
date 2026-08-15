import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
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
    },

    description: {
      type: String,
      default: "",
    },

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
    },

    minOrderValue: {
      type: Number,
      default: 100,
    },

    usageLimit: {
      type: Number,
      default: null,
    },

    usedCount: {
      type: Number,
      default: 0,
    },

    perUserLimit: {
      type: Number,
      default: 1,
    },

    firstOrderOnly: {
      type: Boolean,
      default: false,
    },

    newUsersOnly: {
      type: Boolean,
      default: false,
    },

    applicableServices: {
      type: [String],
      default: [],
    },

    applicablePaymentMethods: {
      type: [String],
      default: [],
    },

    applicableUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    validFrom: {
      type: Date,
      default: Date.now,
    },

    validUntil: {
      type: Date,
      default: null,
    },

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

couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });

export default mongoose.models.Coupon ||
  mongoose.model("Coupon", couponSchema);
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
    },

    avatar: {
      type: String,
      default: "",
    },

    loyaltyPoints: {
      type: Number,
      default: 0,
    },

    savedPaymentMethods: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          auto: true,
        },

        type: {
          type: String,
          enum: ["UPI", "CARD", "COD", "WALLET"],
          required: true,
        },

        provider: {
          type: String,
          default: "",
        },

        maskedDetails: {
          type: String,
          required: true,
        },

        gatewayCustomerId: {
          type: String,
          default: "",
        },

        gatewayToken: {
          type: String,
          default: "",
        },

        isDefault: {
          type: Boolean,
          default: false,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    referralCode: {
      type: String,
      unique: true,
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userSchema);

import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    token: {
      type: String,
      required: true,
    },

    device: {
      type: String,
      default: "Unknown Device",
    },

    browser: {
      type: String,
      default: "Unknown Browser",
    },

    ip: {
      type: String,
      default: "",
    },

    userAgent: {
      type: String,
      default: "",
    },

    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Session", sessionSchema);
import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    fullName: String,
    phone: String,

    line1: String,
    line2: String,
    landmark: String,

    city: String,
    state: String,
    pincode: String,

    lat: Number,
    lng: Number,

    label: {
      type: String,
      enum: ["Home", "Work", "Hostel", "PG", "Other"],
      default: "Home"
    },

    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Address", addressSchema);
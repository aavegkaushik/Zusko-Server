import mongoose from "mongoose";

const { Schema } = mongoose;

const DeliveryPartnerSchema = new Schema(
  {
    partnerId: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
      index: true,
    },

    avatar: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    availabilityStatus: {
      type: String,
      enum: ["Available", "Busy", "Offline"],
      default: "Available",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

DeliveryPartnerSchema.index({ isActive: 1, availabilityStatus: 1 });

const DeliveryPartner = mongoose.model("DeliveryPartner", DeliveryPartnerSchema);

export default DeliveryPartner;


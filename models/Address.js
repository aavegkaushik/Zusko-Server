import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fullName: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    line1: {
      type: String,
      trim: true,
    },

    line2: {
      type: String,
      trim: true,
    },

    landmark: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    pincode: {
      type: String,
      trim: true,
    },

    // GPS coordinates
    lat: {
      type: Number,
      min: -90,
      max: 90,
    },

    lng: {
      type: Number,
      min: -180,
      max: 180,
    },

    googlePlaceId: {
      type: String,
      trim: true,
    },

    // GeoJSON
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },

      coordinates: {
        type: [Number],
        validate: {
          validator: function (value) {
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              Number.isFinite(value[0]) &&
              Number.isFinite(value[1])
            );
          },
          message: "Invalid GeoJSON coordinates",
        },
      },
    },

    label: {
      type: String,
      enum: ["Home", "Work", "Hostel", "PG", "Other"],
      default: "Home",
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

addressSchema.index({
  location: "2dsphere",
});

export default mongoose.model("Address", addressSchema);
import mongoose from "mongoose";

const PricingSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true,
      enum: [
        "Wash & Fold",
        "Wash & Iron",
        "Dry Clean",
        "Steam Iron",
        "Commercial Laundry",
      ],
      trim: true,
    },

    category: {
      type: String,
      required: true,
      enum: [
        "Men",
        "Women",
        "Kids",
        "Household",
      ],
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    variant: {
      type: String,
      default: "",
      trim: true,
    },

    careLevel: {
      type: String,
      enum: ["regular", "premium"],
      default: "regular",
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Prevent duplicate pricing entries.
 *
 * Example:
 *
 * Dry Clean + Women + Saree + Heavy + regular
 *
 * can exist only once.
 */
PricingSchema.index(
  {
    service: 1,
    category: 1,
    name: 1,
    variant: 1,
    careLevel: 1,
  },
  {
    unique: true,
  }
);

/*
 * Helpful index for admin/customer pricing queries.
 */
PricingSchema.index({
  service: 1,
  category: 1,
  active: 1,
  sortOrder: 1,
});

const Pricing = mongoose.model("Pricing", PricingSchema);

export default Pricing;
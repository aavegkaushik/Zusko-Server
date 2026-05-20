import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    },

    stars: {
      type: Number,
      min: 1,
      max: 5
    },

    review: String
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Review", reviewSchema);
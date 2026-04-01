import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    phone: { type: String, required: true, unique: true },
    email: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
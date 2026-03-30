import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  password: String, // optional (future)
});

export default mongoose.model("User", userSchema);
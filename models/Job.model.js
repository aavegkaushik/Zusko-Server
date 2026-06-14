import mongoose from "mongoose";

const jobSchema = new mongoose.Schema({
  title: String,
  department: String,
  location: String,

  type: {
    type: String,
    enum: [
      "Full Time",
      "Part Time",
      "Internship",
      "Remote",
    ],
  },

  salary: String,

  description: String,

    responsibilities: {
      type: [String],
      default: [],
    },

    qualifications: {
      type: [String],
      default: [],
    },

    benefits: {
      type: [String],
      default: [],
    },

  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

export default mongoose.model("Job", jobSchema);
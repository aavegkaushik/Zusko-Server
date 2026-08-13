import mongoose from "mongoose";

const businessLeadSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },

    website: {
      type: String,
      default: "",
    },

    ownerName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },

    businessType: {
      type: String,
      required: true,
    },

    estimatedVolume: {
      type: String,
      required: true,
    },

    pickupFrequency: {
      type: String,
      required: true,
    },

    requirements: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "CONTACTED",
        "MEETING",
        "QUOTE_SENT",
        "NEGOTIATION",
        "APPROVED",
        "REJECTED",
      ],
      default: "NEW",
    },

    leadSource: {
    type: String,
    default: "Website"
},

priority: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH"],
    default: "MEDIUM"
},

quoteSent: {
    type: Boolean,
    default: false
},

converted: {
    type: Boolean,
    default: false
},

    notes: {
      type: String,
      default: "",
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("BusinessLead", businessLeadSchema);
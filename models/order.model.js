import mongoose from "mongoose";

const { Schema } = mongoose;

const ItemSchema = new Schema(
  {
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    service: { type: String, required: true },
  },
  { _id: false },
);

// === Update: include all statuses used by routes ===
const STATUS_ENUM = [
  "pending",
  "in-progress",
  "ready-for-delivery",
  "out-for-delivery",
  "completed",
  "cancelled",
];

const PAYMENT_STATUS_ENUM = [
  "pending", // Order created but payment not initiated
  "initiated", // Payment gateway started
  "paid", // Money received successfully
  "failed", // Payment failed
  "refunded", // Money refunded
  "cod", // Cash on delivery
];

const OrderSchema = new Schema(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },

    customerName: { type: String, default: "Guest" },
    customerPhone: { type: String },
    customerEmail: {
  type: String,
  required: true,
},
    
    pickupContact: {
  name: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: "",
  },
  isAlternate: {
    type: Boolean,
    default: false,
  },
},
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    pickup: {
      date: String,
      time: String
    },

    address: {
      fullAddress: String,
      landmark: String,
      city: String,
      pincode: String,
    },

    items: { type: [ItemSchema], default: [] },

    total: { type: Number, min: 0, default: 0 },

    //Payment Status
    payment: {
      status: {
        type: String,
        enum: PAYMENT_STATUS_ENUM,
        default: "pending",
        index: true,
      },

      method: {
        type: String, // UPI, Razorpay, COD, Wallet, etc
      },

      transactionId: {
        type: String,
        index: true,
      },

      amount: {
        type: Number,
        min: 0,
        default: 0,
      },

      paidAt: {
        type: Date,
      },

      refundedAt: {
        type: Date,
      },
    },

    rating: {
      stars: {
        type: Number,
        min: 1,
        max: 5,
      },

      review: {
        type: String,
        default: "",
      },

      ratedAt: Date,
    },

    deliveryAgent: {
      name: String,
      phone: String,
      agentId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    estimatedDelivery: Date,
    invoiceUrl: String,

    // === Use canonical enum that matches your routes ===
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: "pending",
      index: true,
    },

    pickedAt: { type: Date },
    deliveredAt: { type: Date },
    notes: { type: String },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    // optional history (useful)
    history: {
      type: [
        {
          status: { type: String, enum: STATUS_ENUM, required: true },
          changedAt: { type: Date, default: Date.now },
          note: { type: String },
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } },
);

// Pre-save hook: recompute total, push status history if changed
// OrderSchema.pre("save", function (next) {
//   try {
//     // recompute total
//     if (Array.isArray(this.items) && this.items.length) {
//       const sum = this.items.reduce(
//         (acc, it) => acc + (Number(it.qty || 0) * Number(it.price || 0)),
//         0
//       )
//       this.total = sum
//     } else {
//       this.total = 0
//     }

//     // sync payment amount
// if (this.payment) {
//   this.payment.amount = this.total

//   if (this.payment.status === "paid" && !this.payment.paidAt) {
//     this.payment.paidAt = new Date()
//   }
// }

//     // push history entry when status changed (document saves)
//     if (typeof this.isModified === "function" && this.isModified("status")) {
//       this.history = this.history || []
//       this.history.push({ status: this.status, changedAt: new Date() })
//     }

//     // set timestamps (mongoose already does this, but safe)
//     this.updatedAt = new Date()
//     if (!this.createdAt) this.createdAt = new Date()

//     return next()
//   } catch (err) {
//     return next(err)
//   }
// })

// Ensure findOneAndUpdate (used by findByIdAndUpdate) keeps total/history/timestamps in sync
OrderSchema.pre("findOneAndUpdate", function () {
  // `this` is the query
  try {
    const update = this.getUpdate();
    if (!update) return;

    // canonicalize helpers
    const normalize = (s) =>
      String(s || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    // ensure $set and $push exist for consistent handling
    update.$set = update.$set || {};
    update.$push = update.$push || {};

    // ---------- handle items -> recompute total if items replaced ----------
    const itemsBeingSet =
      (update.$set && Array.isArray(update.$set.items)) ||
      Array.isArray(update.items);
    if (itemsBeingSet) {
      const items = Array.isArray(update.$set.items)
        ? update.$set.items
        : update.items;
      const sum = items.reduce(
        (acc, it) => acc + Number(it.qty || 0) * Number(it.price || 0),
        0,
      );
      update.$set.total = sum;
      // remove top-level total to avoid conflicts
      if (typeof update.total !== "undefined") delete update.total;
      if (typeof update.items !== "undefined") delete update.items;
    }

    // ---------- canonicalize status ----------
    // read status from $set OR top-level
    const rawStatus =
      (update.$set && update.$set.status) || update.status || null;
    let finalStatus = null;
    if (rawStatus) {
      const matched = STATUS_ENUM.find(
        (s) => normalize(s) === normalize(rawStatus),
      );
      finalStatus = matched || rawStatus;
      update.$set.status = finalStatus;
      if (update.status) delete update.status;
    }

    // ---------- prepare history entry ----------
    const historyEntry = finalStatus
      ? { status: finalStatus, changedAt: new Date() }
      : null;

    // ---------- resolve conflicts between $set.history, top-level history, and $push.history ----------
    const topLevelHistory = Array.isArray(update.history)
      ? update.history
      : null;
    const setHistory = Array.isArray(update.$set.history)
      ? update.$set.history
      : null;
    const pushHistory =
      update.$push && update.$push.history ? update.$push.history : null;

    if (historyEntry) {
      if (topLevelHistory || setHistory) {
        // combine whichever exists into a single array and set via $set
        const base = Array.isArray(setHistory)
          ? setHistory.slice()
          : Array.isArray(topLevelHistory)
            ? topLevelHistory.slice()
            : [];
        base.push(historyEntry);
        update.$set.history = base;
        if (update.history) delete update.history;
        if (update.$push && update.$push.history) delete update.$push.history;
      } else if (pushHistory) {
        // $push.history already present - may be object or array
        if (Array.isArray(pushHistory)) {
          const base = pushHistory.slice();
          base.push(historyEntry);
          update.$set.history = base;
          delete update.$push.history;
        } else {
          // if $push.history is an object like { $each: [...] }, merge into $each
          if (
            typeof pushHistory === "object" &&
            pushHistory.$each &&
            Array.isArray(pushHistory.$each)
          ) {
            pushHistory.$each.push(historyEntry);
            update.$push.history = pushHistory;
          } else {
            // simple case: $push.history is a single entry -> convert to $push with $each
            update.$push.history = { $each: [pushHistory, historyEntry] };
          }
        }
      } else {
        // nothing present: safe to $push our entry (object form is accepted)
        update.$push.history = historyEntry;
      }
    }

    // ---------- pickedAt / deliveredAt and updatedAt ----------
    if (
      finalStatus === "in-progress" &&
      !("pickedAt" in update.$set) &&
      !("pickedAt" in update)
    ) {
      update.$set.pickedAt = new Date();
      if (update.pickedAt) delete update.pickedAt;
    }
    if (
      finalStatus === "completed" &&
      !("deliveredAt" in update.$set) &&
      !("deliveredAt" in update)
    ) {
      update.$set.deliveredAt = new Date();
      if (update.deliveredAt) delete update.deliveredAt;
    }

    // always set updatedAt
    update.$set.updatedAt = new Date();

    // clean up possible conflicting top-level fields that clash with $set
    if (
      typeof update.total !== "undefined" &&
      typeof update.$set.total !== "undefined"
    ) {
      delete update.total;
    }
    if (
      typeof update.status !== "undefined" &&
      typeof update.$set.status !== "undefined"
    ) {
      delete update.status;
    }
    if (
      typeof update.history !== "undefined" &&
      typeof update.$set.history !== "undefined"
    ) {
      delete update.history;
    }

    // ---------- payment sync ----------
    if (update.$set && update.$set["payment.status"] === "paid") {
      update.$set["payment.paidAt"] = new Date();
    }

    if (
      update.$set &&
      update.$set.total &&
      update.$set["payment.amount"] === undefined
    ) {
      update.$set["payment.amount"] = update.$set.total;
    }

    // write back the resolved update
    this.setUpdate(update);
    next();
  } catch (err) {
    console.error("Order pre-findOneAndUpdate error (conflict-resolver):", err);
  }
});

// helper static
OrderSchema.statics.getAllowedStatuses = function () {
  return STATUS_ENUM.slice();
};

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);

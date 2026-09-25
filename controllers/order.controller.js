import Order from "../models/order.model.js";
import { sendTelegramAlert } from "../services/telegramService.js";
import { sendEmail } from "../utils/sendEmail.js";
import { generateOrderPlacedEmail } from "../utils/orderEmails.js";
import Coupon from "../models/coupon.model.js";
import CouponUsage from "../models/couponUsage.model.js";
import { checkEligibility } from "./coupon.controller.js";
import Address from "../models/Address.js";
import { calculateDelivery } from "../services/deliveryService.js";

// import { refundPayment } from "./payment.controller.js";


// =========================================================
// GET ACTIVE ORDERS
// =========================================================
export const getActiveOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { customerId: req.user._id },
        { customerPhone: req.user.phone },
      ],
      status: {
        $nin: ["completed", "cancelled"],
      },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// GET ORDER HISTORY
// =========================================================
export const getOrderHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { customerId: req.user._id },
        { customerPhone: req.user.phone },
      ],
      status: {
        $in: ["completed", "cancelled"],
      },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// GET SINGLE ORDER TRACKING
// =========================================================
export const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { customerId: req.user._id },
        { customerPhone: req.user.phone },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: order._id,
        orderId: order.orderId,

        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,

        status: order.status,

        pickup: order.pickup,
        pickupContact: order.pickupContact,

        address: order.address,

        items: order.items,

        originalTotal: order.originalTotal || 0,
        handlingFee: order.handlingFee || 0,
        deliveryFee: order.deliveryFee || 0,
        discount: order.discount || 0,

        total: order.total,

        payment: order.payment,

        history: order.history,

        estimatedDelivery: order.estimatedDelivery || null,

        deliveryAgent: order.deliveryAgent || null,

        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// CANCEL ORDER
// =========================================================
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { customerId: req.user._id },
        { customerPhone: req.user.phone },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Order cannot be cancelled after processing starts
    if (
      [
        "in-progress",
        "ready-for-delivery",
        "out-for-delivery",
        "completed",
      ].includes(order.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled now",
      });
    }

    order.status = "cancelled";

    if (!Array.isArray(order.history)) {
      order.history = [];
    }

    order.history.push({
      status: "cancelled",
      changedAt: new Date(),
      note: "Cancelled by customer",
    });

    await order.save();

    // Refund handling
    if (order.payment?.status === "paid") {
      order.refund = {
        status: "processing",
        amount: order.payment.amount,
        initiatedAt: new Date(),
      };

      await order.save();

      // Uncomment when refundPayment is ready
      // await refundPayment(order);
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// RATE ORDER
// =========================================================
export const rateOrder = async (req, res) => {
  try {
    const { stars, review } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { customerId: req.user._id },
        { customerPhone: req.user.phone },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Only completed orders can be rated",
      });
    }

    if (order.rating?.stars) {
      return res.status(400).json({
        success: false,
        message: "Order already rated",
      });
    }

    const numericStars = Number(stars);

    if (
      !Number.isFinite(numericStars) ||
      numericStars < 1 ||
      numericStars > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const rating = {
      stars: numericStars,
      review: review || "",
      ratedAt: new Date(),
    };

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          rating,
        },
      },
      {
        new: true,
        runValidators: false,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Rating submitted successfully",
      data: rating,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// =========================================================
// CREATE ORDER
// =========================================================
export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      pickupContact,
      pickup,
      address,
      items,
      payment,
      couponCode,
    } = req.body;

    const userId = req.user?._id;

    // -------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // -------------------------------------------------------
    // ITEMS VALIDATION
    // -------------------------------------------------------
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items in order",
      });
    }

    // -------------------------------------------------------
    // ADDRESS VALIDATION
    // -------------------------------------------------------
    if (!address || typeof address !== "object") {
      return res.status(400).json({
        success: false,
        code: "ADDRESS_REQUIRED",
        message: "Delivery address is required",
      });
    }

    // =======================================================
    // FORMAT ITEMS
    // =======================================================
    const formattedItems = items.map((item) => ({
      name: String(item?.name || "").trim(),

      qty: Number(item?.qty || 0),

      price: Number(item?.price || 0),

      service: String(item?.service || "").trim(),

      careLevel:
        item?.careLevel === "premium"
          ? "premium"
          : "regular",
    }));

    // -------------------------------------------------------
    // INVALID ITEM CHECK
    // -------------------------------------------------------
    const invalidItem = formattedItems.find(
      (item) =>
        !item.name ||
        !item.service ||
        !Number.isFinite(item.qty) ||
        item.qty <= 0 ||
        !Number.isFinite(item.price) ||
        item.price < 0
    );

    if (invalidItem) {
      return res.status(400).json({
        success: false,
        message: "Invalid item details",
      });
    }

    // =======================================================
    // SERVER-SIDE SUBTOTAL
    // NEVER TRUST FRONTEND TOTAL
    // =======================================================
    const originalTotal =
      Math.round(
        formattedItems.reduce(
          (sum, item) =>
            sum + item.qty * item.price,
          0
        ) * 100
      ) / 100;

    if (
      !Number.isFinite(originalTotal) ||
      originalTotal <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount",
      });
    }

    // =======================================================
    // GET CUSTOMER LOCATION
    // =======================================================
    const latitude =
      address?.location?.latitude ??
      address?.lat;

    const longitude =
      address?.location?.longitude ??
      address?.lng;

    if (
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude))
    ) {
      return res.status(400).json({
        success: false,
        code: "LOCATION_REQUIRED",
        message:
          "Please select a valid delivery location",
      });
    }

    // =======================================================
    // SERVER-SIDE DELIVERY CALCULATION
    // =======================================================
    let deliveryCalculation;

    try {
      deliveryCalculation =
        await calculateDelivery({
          latitude: Number(latitude),
          longitude: Number(longitude),
          orderValue: originalTotal,
        });
    } catch (error) {
      if (
        error.code ===
        "OUTSIDE_SERVICE_AREA"
      ) {
        return res.status(400).json({
          success: false,
          code: "OUTSIDE_SERVICE_AREA",
          message:
            "We are not serving in this area yet",
        });
      }

      throw error;
    }

    const serverDeliveryFee =
      Number(
        deliveryCalculation?.deliveryFee || 0
      );

    const roadDistanceKm =
      Number(
        deliveryCalculation?.distanceKm || 0
      );

    const deliveryRatePerKm =
      Number(
        deliveryCalculation?.ratePerKm || 0
      );

    // =======================================================
    // HANDLING FEE
    // =======================================================
    const handlingFee =
      originalTotal > 0 ? 15 : 0;

    // =======================================================
    // COUPON VALIDATION
    // =======================================================
    let discount = 0;
    let appliedCoupon = null;

    if (
      couponCode &&
      String(couponCode).trim()
    ) {
      const normalizedCode =
        String(couponCode)
          .trim()
          .toUpperCase();

      const coupon =
        await Coupon.findOne({
          code: normalizedCode,
          isActive: true,
        });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid or inactive coupon",
        });
      }

      // Use centralized coupon eligibility logic
      const eligibility =
        await checkEligibility(
          coupon,
          req.user,
          originalTotal,
          formattedItems
        );

      if (!eligibility.eligible) {
        return res.status(400).json({
          success: false,
          message:
            eligibility.message ||
            "Coupon is not valid",
        });
      }

      discount =
        Math.round(
          Number(
            eligibility.discount || 0
          ) * 100
        ) / 100;

      appliedCoupon = coupon;
    }

    // =======================================================
    // FINAL TOTAL
    // =======================================================
    const finalAmount =
      Math.max(
        Math.round(
          (
            originalTotal +
            serverDeliveryFee +
            handlingFee -
            discount
          ) * 100
        ) / 100,
        0
      );

    // =======================================================
    // ORDER ID
    // =======================================================
    const orderId =
      "ZSK" +
      Date.now() +
      Math.floor(
        Math.random() * 1000
      );

    // =======================================================
    // CREATE ORDER
    // =======================================================
    const order =
      await Order.create({
        vendorId:
          "6962ad3e962db6a05ddb10dd",

        orderId,

        customerId: userId,

        customerName:
          customerName ||
          req.user?.name ||
          "Guest",

        customerPhone:
          customerPhone ||
          req.user?.phone ||
          "",

        customerEmail:
          req.user?.email,

        pickupContact:
          pickupContact || {
            name:
              customerName ||
              req.user?.name ||
              "",

            phone:
              customerPhone ||
              req.user?.phone ||
              "",

            isAlternate: false,
          },

        items: formattedItems,

        total: finalAmount,

        originalTotal,

        handlingFee,

        discount,

        deliveryFee:
          serverDeliveryFee,

        address: {
          fullAddress:
            address.fullAddress,

          landmark:
            address.landmark,

          city:
            address.city,

          state:
            address.state,

          pincode:
            address.pincode,

          location: {
            latitude:
              Number(
                deliveryCalculation
                  .customerLocation
                  .latitude
              ),

            longitude:
              Number(
                deliveryCalculation
                  .customerLocation
                  .longitude
              ),
          },

          roadDistanceKm,

          deliveryRatePerKm,
        },

        pickup,

        payment: {
          method:
            payment?.method ||
            "COD",

          status:
            payment?.status ||
            "pending",

          amount:
            finalAmount,

          razorpayPaymentId:
            payment?.razorpayPaymentId ||
            null,
        },

        meta: {
          couponCode:
            appliedCoupon?.code ||
            null,

          couponId:
            appliedCoupon?._id ||
            null,
        },

        history: [
          {
            status: "pending",

            changedAt:
              new Date(),

            note: appliedCoupon
              ? `Order created with coupon ${appliedCoupon.code}`
              : "Order created",
          },
        ],
      });

    // =======================================================
    // AUTO SAVE CUSTOMER ADDRESS
    // =======================================================
    try {
      const customerLatitude =
        Number(
          deliveryCalculation
            .customerLocation
            .latitude
        );

      const customerLongitude =
        Number(
          deliveryCalculation
            .customerLocation
            .longitude
        );

      const existingAddress =
        await Address.findOne({
          userId:
            req.user._id,

          lat: {
            $gte:
              customerLatitude -
              0.00005,

            $lte:
              customerLatitude +
              0.00005,
          },

          lng: {
            $gte:
              customerLongitude -
              0.00005,

            $lte:
              customerLongitude +
              0.00005,
          },
        });

      // -----------------------------------------------------
      // UPDATE EXISTING ADDRESS
      // -----------------------------------------------------
      if (existingAddress) {
        existingAddress.fullName =
          address.fullName ||
          existingAddress.fullName;

        existingAddress.phone =
          address.phone ||
          existingAddress.phone;

        existingAddress.line1 =
          address.line1 ||
          address.fullAddress ||
          existingAddress.line1;

        existingAddress.line2 =
          address.line2 ||
          existingAddress.line2;

        existingAddress.landmark =
          address.landmark ||
          existingAddress.landmark;

        existingAddress.city =
          address.city ||
          existingAddress.city;

        existingAddress.state =
          address.state ||
          existingAddress.state;

        existingAddress.pincode =
          address.pincode ||
          existingAddress.pincode;

        existingAddress.lat =
          customerLatitude;

        existingAddress.lng =
          customerLongitude;

        existingAddress.location = {
          type: "Point",

          coordinates: [
            customerLongitude,
            customerLatitude,
          ],
        };

        await existingAddress.save();
      }

      // -----------------------------------------------------
      // CREATE NEW ADDRESS
      // -----------------------------------------------------
      else {
        await Address.updateMany(
          {
            userId:
              req.user._id,
          },
          {
            $set: {
              isDefault: false,
            },
          }
        );

        await Address.create({
          userId:
            req.user._id,

          fullName:
            address.fullName ||
            req.user.name,

          phone:
            address.phone ||
            req.user.phone,

          line1:
            address.line1 ||
            address.fullAddress,

          line2:
            address.line2,

          landmark:
            address.landmark,

          city:
            address.city,

          state:
            address.state,

          pincode:
            address.pincode,

          lat:
            customerLatitude,

          lng:
            customerLongitude,

          location: {
            type: "Point",

            coordinates: [
              customerLongitude,
              customerLatitude,
            ],
          },

          label:
            address.label ||
            "Home",

          isDefault: true,
        });
      }
    } catch (addressError) {
      // Address save failure must not
      // cancel a valid order.
      console.error(
        "AUTO SAVE ADDRESS ERROR:",
        addressError.message
      );
    }

    // =======================================================
    // RECORD COUPON USAGE
    // =======================================================
    if (appliedCoupon) {
      try {
        await CouponUsage.create({
          couponId:
            appliedCoupon._id,

          userId,

          orderId:
            order._id,

          discountAmount:
            discount,

          status: "used",
        });

        await Coupon.findByIdAndUpdate(
          appliedCoupon._id,
          {
            $inc: {
              usedCount: 1,
            },
          }
        );
      } catch (
        couponUsageError
      ) {
        // Do not fail the order if coupon
        // usage recording has an issue.
        console.error(
          "COUPON USAGE ERROR:",
          couponUsageError.message
        );
      }
    }

    // =======================================================
    // TELEGRAM ALERT
    // =======================================================
    try {
      await sendTelegramAlert(order);
    } catch (telegramError) {
      console.error(
        "TELEGRAM ALERT ERROR:",
        telegramError.message
      );
    }

    // =======================================================
    // CONFIRMATION EMAIL
    // =======================================================
    try {
      if (order.customerEmail) {
        await sendEmail({
          to:
            order.customerEmail,

          from:
            process.env.ORDER_MAIL ||
            process.env.MAIL_FROM,

          subject:
            `Your Zusko Order #${order.orderId} is Confirmed 🎉`,

          html:
            generateOrderPlacedEmail(
              order.toObject()
            ),
        });

        console.log(
          `Order confirmation email sent to ${order.customerEmail}`
        );
      }
    } catch (emailError) {
      console.error(
        "Order confirmation email failed:",
        emailError.message
      );
    }

    // =======================================================
    // RESPONSE
    // =======================================================
    return res.status(201).json({
      success: true,

      message:
        "Order created successfully",

      data: order,

      coupon: appliedCoupon
        ? {
            code:
              appliedCoupon.code,

            discount,
          }
        : null,
    });
  } catch (err) {
    console.error(
      "ORDER ERROR:",
      err
    );

    return res.status(500).json({
      success: false,

      message:
        err.message ||
        "Unable to create order",
    });
  }
};


// =========================================================
// GET ORDERS BY PHONE
// =========================================================
// export const getOrdersByPhone = async (req, res) => {
//   const orders = await Order.find({
//     customerPhone: req.params.phone,
//   }).sort({ createdAt: -1 });
//
//   res.json(orders);
// };


// =========================================================
// GET DELIVERY ESTIMATE
// =========================================================
export const getDeliveryEstimate = async (
  req,
  res
) => {
  try {
    const {
      latitude,
      longitude,
      orderValue,
    } = req.body;

    if (
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null
    ) {
      return res.status(400).json({
        success: false,
        code: "LOCATION_REQUIRED",
        message:
          "Your exact location is required",
      });
    }

    const numericLatitude =
      Number(latitude);

    const numericLongitude =
      Number(longitude);

    const numericOrderValue =
      Number(orderValue);

    if (
      !Number.isFinite(
        numericLatitude
      ) ||
      !Number.isFinite(
        numericLongitude
      )
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_LOCATION",
        message:
          "Invalid location coordinates",
      });
    }

    if (
      !Number.isFinite(
        numericOrderValue
      ) ||
      numericOrderValue < 0
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ORDER_VALUE",
        message:
          "Invalid order value",
      });
    }

    const delivery =
      await calculateDelivery({
        latitude:
          numericLatitude,

        longitude:
          numericLongitude,

        orderValue:
          numericOrderValue,
      });

    return res.status(200).json({
      success: true,
      data: delivery,
    });
  } catch (error) {
    console.error(
      "DELIVERY ESTIMATE ERROR:",
      error
    );

    if (
      error.code ===
      "OUTSIDE_SERVICE_AREA"
    ) {
      return res.status(400).json({
        success: false,
        code:
          "OUTSIDE_SERVICE_AREA",
        message:
          "We are not serving in this area yet",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to calculate delivery charge",
    });
  }
};
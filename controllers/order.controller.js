import Order from "../models/order.model.js";
import { sendTelegramAlert } from "../services/telegramService.js";
import User from "../models/User.model.js";
import { sendEmail } from "../utils/sendEmail.js";
import { generateOrderPlacedEmail } from "../utils/orderEmails.js";
// GET ACTIVE ORDERS
export const getActiveOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
      status: {
        $nin: ["completed", "cancelled"],
      },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET ORDER HISTORY
export const getOrderHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
      status: {
        $in: ["completed", "cancelled"],
      },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET SINGLE ORDER TRACKING
export const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        pickup: order.pickup,
        address: order.address,
        items: order.items,
        total: order.total,
        payment: order.payment,
        history: order.history,
        estimatedDelivery: order.estimatedDelivery || null,
        deliveryAgent: order.deliveryAgent || null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// CANCEL ORDER
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // allowed only before processing starts
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

    order.history.push({
      status: "cancelled",
      changedAt: new Date(),
      note: "Cancelled by customer",
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// RATE ORDER
export const rateOrder = async (req, res) => {
  try {
    const { stars, review } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      $or: [{ customerId: req.user._id }, { customerPhone: req.user.phone }],
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

    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    order.rating = {
      stars,
      review: review || "",
      ratedAt: new Date(),
    };

    await order.save();

    res.status(200).json({
      success: true,
      message: "Rating submitted successfully",
      data: order.rating,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      pickupContact,
      pickup,
      address,
      items,
      total,
      discount = 0,
      deliveryFee = 0,
      payment,
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: "No items in order",
      });
    }

    const formattedItems = items.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      service: item.service,
    }));

    const originalTotal = formattedItems.reduce(
      (acc, item) => acc + item.qty * item.price,
      0
    );

    const finalAmount = total;

    const orderId = "ZSK" + Date.now().toString().slice(-6);

    const order = await Order.create({
      vendorId: "6962ad3e962db6a05ddb10dd",

      orderId,

      customerId: req.user?._id,

      customerName: customerName || req.user?.name || "Guest",

      customerPhone: customerPhone || req.user?.phone || "",

      customerEmail: req.user.email,

      pickupContact:
        pickupContact || {
          name: customerName || req.user?.name || "",
          phone: customerPhone || req.user?.phone || "",
          isAlternate: false,
        },

      items: formattedItems,

      total: finalAmount,
      originalTotal,
      discount,
      deliveryFee,

      address,
      pickup,

      payment: {
        method: payment?.method || "COD",

        status:
          payment?.status ||
          (payment?.method === "COD"
            ? "cod"
            : "pending"),

        amount: finalAmount,
      },

      history: [
        {
          status: "pending",
          changedAt: new Date(),
          note: "Order created",
        },
      ],
    });

    /* ==========================
       Telegram Alert
    ========================== */

    sendTelegramAlert(order);

    /* ==========================
       Send Confirmation Email
    ========================== */

    try {
      const user = await User.findById(
        order.customerId
      );

      if (order.customerEmail) {
  await sendEmail({
    to: order.customerEmail,

    from:
      process.env.ORDERS_MAIL_FROM ||
      process.env.MAIL_FROM,

    subject: `Your Zusko Order #${order.orderId} is Confirmed 🎉`,

    html: generateOrderPlacedEmail(
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

      // Email fail hone par order rollback nahi hoga
    }

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });

  } catch (err) {
    console.error("ORDER ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// export const getOrdersByPhone = async (req, res) => {
//   const orders = await Order.find({
//     customerPhone: req.params.phone,
//   }).sort({ createdAt: -1 });

//   res.json(orders);
// };

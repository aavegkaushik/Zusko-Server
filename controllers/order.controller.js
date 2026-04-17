import Order from "../models/order.model.js";

export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      address,
      items,
      total, // ✅ this is finalAmount from frontend
      discount = 0,
      deliveryFee = 0,
      payment,
    } = req.body;

    // ✅ Format items
    const formattedItems = items.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      service: item.service,
    }));

    // ✅ Calculate original total (for validation only)
    const originalTotal = formattedItems.reduce(
      (acc, item) => acc + item.qty * item.price,
      0,
    );

    // ✅ Final amount (IMPORTANT)
    const finalAmount = total;

    const orderId = "ZSK" + Date.now().toString().slice(-6);

    const order = await Order.create({
      vendorId: "6962ad3e962db6a05ddb10dd",
      orderId,

      customerName,
      customerPhone,

      items: formattedItems,

      // ✅ STORE EVERYTHING
      total: finalAmount, // final price
      originalTotal, // before discount
      discount,
      deliveryFee,

      address,

      payment: {
        method: payment?.method || "COD",
        status:
          payment?.status || (payment?.method === "COD" ? "cod" : "pending"),
        amount: finalAmount,
      },
    });

    res.json(order);
  } catch (err) {
    console.error("ORDER ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getOrdersByPhone = async (req, res) => {
  const orders = await Order.find({
    customerPhone: req.params.phone,
  }).sort({ createdAt: -1 });

  res.json(orders);
};

export const getAllOrders = async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
};

export const trackOrder = async (req, res) => {
  try {
    console.log("USER:", req.user);

    const order = await Order.findOne({ user: req.user._id }).sort({
      createdAt: -1,
    });

    if (!order) {
      return res.status(404).json({ message: "No orders found" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

import Order from "../models/order.model.js";

export const createOrder = async (req, res) => {
  try {
    const {
      items,
      customerName,
      customerPhone,
      pickup,
      address,
      paymentMethod,
    } = req.body;

    const order = await Order.create({
      vendorId: "6962ad3e962db6a05ddb10dd",

      customerName,
      customerPhone,

      items,
      pickup,
      address,

      payment: {
        method: paymentMethod,
        status: paymentMethod === "COD" ? "cod" : "pending",
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
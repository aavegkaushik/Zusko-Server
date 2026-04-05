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

    // ✅ Format items (VERY IMPORTANT)
    const formattedItems = items.map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      service: item.service, // ✅ FIXED
    }));

    // ✅ Calculate total safely
    const total = formattedItems.reduce(
      (acc, item) => acc + item.qty * item.price,
      0
    );
    const orderId =
      "ZSK" + Date.now().toString().slice(-6); 

    const order = await Order.create({
      vendorId: "6962ad3e962db6a05ddb10dd",
      orderId,
      customerName,
      customerPhone,

      items: formattedItems, // ✅ use formatted items
      total,

      pickup,
      address,

      payment: {
        method: paymentMethod,
        status: paymentMethod === "COD" ? "cod" : "pending",
        amount: total,
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

    const order = await Order.findOne({ user: req.user._id })
      .sort({ createdAt: -1 });

    if (!order) {
      return res.status(404).json({ message: "No orders found" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}
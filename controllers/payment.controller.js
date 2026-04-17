import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: "rzp_test_SeawcubEUW2ev1",
  key_secret: "28rjHvVxnAw42BVfgGVvQEjl",
});

export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "order_rcptid_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
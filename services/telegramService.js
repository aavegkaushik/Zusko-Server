import axios from "axios";

export const sendTelegramAlert = async (order) => {
  try {
    const message = `
🚨 NEW ZUSKO ORDER

👤 Customer: ${order.customerName}
📞 Phone: ${order.phone}
💰 Amount: ₹${order.totalAmount}
🧺 Items: ${order.items?.length || 0}
📍 Address: ${order.address}
🆔 Order ID: ${order._id}
📅 Pickup Date: ${order.pickupDate || "N/A"}
`;

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }
    );

    console.log("Telegram alert sent");
  } catch (error) {
    console.error(
      "Telegram Error:",
      error.response?.data || error.message
    );
  }
};
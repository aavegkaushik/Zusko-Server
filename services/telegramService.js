import axios from "axios";

export const sendTelegramAlert = async (order) => {
  const pickupDate = order.pickup?.date
  ? new Date(order.pickup.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  : "N/A";

  const itemsText = order.items
  ?.map(
    (item) =>
      `• ${item.name} (${item.service}) × ${item.qty} = ₹${item.qty * item.price}`
  )
  .join("\n");
  try {
    const message = `
🚨 NEW ZUSKO ORDER

👤 Customer: ${order.customerName}
📞 Phone: ${order.customerPhone}
🤝 Pickup Contact: ${order.pickupContact?.name}
📱 Pickup Mobile: ${order.pickupContact?.phone}
💰 Order Total: ₹${order.total}
🧺 ITEMS
${itemsText}

📍 Address:
${order.address?.fullAddress || ""}
${order.address?.city || ""}
${order.address?.pincode || ""}

📅 Pickup: ${pickupDate} (${order.pickup?.time || "N/A"})

💳 Payment: ${order.payment?.method || "N/A"}
💰 Payment Amount: ₹${order.payment?.amount || 0}
📌 Payment Status: ${order.payment?.status || "N/A"}
🆔 Order ID: ${order.orderId}
`;

console.log("ORDER DATA:", JSON.stringify(order, null, 2));

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
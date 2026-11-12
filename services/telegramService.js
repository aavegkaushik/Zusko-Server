import axios from "axios";
import logger from "../utils/logger.js";

export const sendTelegramAlert = async (orderOrMessage) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn("Telegram alert skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured");
    return;
  }

  let messageText = "";

  if (typeof orderOrMessage === "string") {
    messageText = orderOrMessage;
  } else if (orderOrMessage && typeof orderOrMessage === "object") {
    const order = orderOrMessage;
    const pickupDate = order.pickup?.date
      ? new Date(order.pickup.date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "N/A";

    const itemsText = Array.isArray(order.items)
      ? order.items
          .map(
            (item) =>
              `• ${item.name} (${item.service}) × ${item.qty} = ₹${item.qty * item.price}`
          )
          .join("\n")
      : "N/A";

    messageText = `
🚨 NEW ZUSKO ORDER

👤 Customer: ${order.customerName || "N/A"}
📞 Phone: ${order.customerPhone || "N/A"}
🤝 Pickup Contact: ${order.pickupContact?.name || "N/A"}
📱 Pickup Mobile: ${order.pickupContact?.phone || "N/A"}
💰 Order Total: ₹${order.total || 0}
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
🆔 Order ID: ${order.orderId || order._id || "N/A"}
`;
  } else {
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text: messageText,
      },
      {
        timeout: 8000, // 8 seconds timeout prevents hanging sockets
      }
    );
    logger.info("Telegram alert sent successfully");
  } catch (error) {
    logger.warn("Telegram Alert failed:", {
      message: error.message,
      status: error.response?.status,
    });
  }
};

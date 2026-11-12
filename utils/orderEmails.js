export const generateOrderPlacedEmail = (order) => {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.qty}</td>
        <td>₹${item.qty * item.price}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div style="font-family:Segoe UI,Arial;background:#f5f5f5;padding:30px;">
      <table style="max-width:600px;background:white;margin:auto;border-radius:12px;padding:30px;">

        <tr>
          <td>
            <img
              src="https://www.zusko.in/assets/zusko-CuTZ8EeH.png"
              style="height:45px;"
            />
          </td>
        </tr>

        <tr>
          <td>
            <h2>Your Order is Confirmed 🎉</h2>

            <p>
              Hi ${order.customerName},
            </p>

            <p>
              Thank you for choosing Zusko.
              We have received your order.
            </p>

            <p>
              <strong>Order ID:</strong>
              ${order.orderId}
            </p>
          </td>
        </tr>

        <tr>
          <td>
            <table width="100%">
              ${itemsHtml}
            </table>
          </td>
        </tr>

        <tr>
          <td>
            <p>
              <strong>Total:</strong>
              ₹${order.total}
            </p>

            <p>
              <strong>Payment:</strong>
              ${order.payment.method}
            </p>
          </td>
        </tr>

        <tr>
          <td>
            <a
              href="https://www.zusko.in/orders"
              style="
                background:#FFD400;
                color:black;
                padding:12px 20px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Track Order
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding-top:30px;font-size:12px;color:#777;">
            © ${new Date().getFullYear()} Zusko.
            All rights reserved.
          </td>
        </tr>

      </table>
    </div>
  `;
};

/**
 * Branded transactional email sent when an order is cancelled by the company / store team
 */
export const generateOrderCancelledEmail = (order, reason = "") => {
  const itemsHtml = Array.isArray(order.items)
    ? order.items
        .map(
          (item) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#333;">${item.name} (${item.service || "Standard"})</td>
          <td style="padding:10px 0;text-align:center;color:#666;">×${item.qty}</td>
          <td style="padding:10px 0;text-align:right;color:#333;font-weight:600;">₹${item.qty * item.price}</td>
        </tr>
      `
        )
        .join("")
    : "";

  const isPaid = order.payment?.status === "paid" || order.payment?.method === "ONLINE";
  const refundSectionHtml = isPaid
    ? `
      <div style="background:#FFF9E6;border-left:4px solid #FFD400;padding:15px;border-radius:6px;margin:20px 0;">
        <p style="margin:0 0 5px 0;font-weight:bold;color:#7A5500;font-size:15px;">Refund Initiated</p>
        <p style="margin:0;font-size:14px;color:#555;line-height:22px;">
          Your payment of <strong>₹${order.total || 0}</strong> has been initiated for an automatic refund via ${order.payment?.method || "online payment"}. 
          It will be credited back to your original payment source within <strong>5-7 business days</strong>.
        </p>
      </div>
    `
    : `
      <div style="background:#F4F6F8;border-left:4px solid #888;padding:15px;border-radius:6px;margin:20px 0;">
        <p style="margin:0 0 5px 0;font-weight:bold;color:#333;font-size:15px;">Payment Notice</p>
        <p style="margin:0;font-size:14px;color:#555;line-height:22px;">
          Since this order was set as <strong>Cash on Delivery (COD)</strong>, no amount was charged or deducted.
        </p>
      </div>
    `;

  const cancellationReasonHtml = reason
    ? `
      <div style="margin:18px 0;padding:12px 16px;background:#FFF1F0;border-radius:6px;border:1px solid #FFA39E;color:#CF1322;font-size:14px;">
        <strong>Cancellation Reason:</strong> ${reason}
      </div>
    `
    : `
      <div style="margin:18px 0;padding:12px 16px;background:#FFF1F0;border-radius:6px;border:1px solid #FFA39E;color:#CF1322;font-size:14px;">
        <strong>Cancellation Reason:</strong> Cancelled due to operational or scheduling constraints.
      </div>
    `;

  return `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f7fb;padding:30px 15px;">
      <table style="max-width:600px;width:100%;background:#ffffff;margin:auto;border-radius:12px;padding:30px;box-shadow:0 4px 15px rgba(0,0,0,0.05);border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:20px;border-bottom:1px solid #eeeeee;">
            <img
              src="https://www.zusko.in/assets/zusko-CuTZ8EeH.png"
              alt="Zusko"
              style="height:42px;display:block;"
            />
          </td>
        </tr>

        <tr>
          <td style="padding-top:25px;">
            <h2 style="color:#d93025;margin:0 0 10px 0;font-size:22px;">Order Cancelled by Zusko</h2>
            <p style="font-size:15px;color:#333;margin:0 0 12px 0;line-height:22px;">
              Dear <strong>${order.customerName || "Customer"}</strong>,
            </p>
            <p style="font-size:14px;color:#555;margin:0 0 15px 0;line-height:22px;">
              We regret to inform you that your order <strong>#${order.orderId || order._id}</strong> has been cancelled by our store operations team.
            </p>

            ${cancellationReasonHtml}
            ${refundSectionHtml}
          </td>
        </tr>

        ${
          itemsHtml
            ? `
        <tr>
          <td style="padding-top:15px;">
            <h3 style="font-size:15px;margin:0 0 10px 0;color:#222;border-bottom:2px solid #f0f0f0;padding-bottom:8px;">Order Details</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
              ${itemsHtml}
            </table>
          </td>
        </tr>
        `
            : ""
        }

        <tr>
          <td style="padding-top:15px;">
            <table width="100%" style="font-size:14px;color:#333;">
              <tr>
                <td style="padding:6px 0;"><strong>Total Amount:</strong></td>
                <td style="padding:6px 0;text-align:right;font-weight:bold;font-size:16px;">₹${order.total || 0}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;"><strong>Payment Method:</strong></td>
                <td style="padding:6px 0;text-align:right;">${order.payment?.method || "N/A"}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding-top:30px;text-align:center;">
            <a
              href="https://www.zusko.in/orders"
              style="
                background:#FFD400;
                color:#111;
                padding:12px 25px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
                display:inline-block;
                font-size:14px;
              "
            >
              View Orders
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding-top:25px;font-size:13px;color:#666;line-height:20px;border-top:1px solid #f0f0f0;margin-top:25px;">
            <p style="margin:0 0 5px 0;">We sincerely apologize for the inconvenience this may have caused.</p>
            <p style="margin:0;">If you have any questions, our support team is here to help at <a href="mailto:support@zusko.in" style="color:#0066cc;text-decoration:none;">support@zusko.in</a>.</p>
          </td>
        </tr>

        <tr>
          <td style="padding-top:20px;font-size:12px;color:#999;text-align:center;">
            © ${new Date().getFullYear()} Zusko Laundry Services. All rights reserved.
          </td>
        </tr>
      </table>
    </div>
  `;
};

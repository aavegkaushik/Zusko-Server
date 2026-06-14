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
              src="https://www.zusko.in/logo.png"
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
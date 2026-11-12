import { generateOrderPlacedEmail, generateOrderCancelledEmail } from "../utils/orderEmails.js";

function assert(condition, name) {
  if (condition) {
    console.log(`[PASS] ${name}`);
  } else {
    console.error(`[FAIL] ${name}`);
    process.exit(1);
  }
}

console.log("=== RUNNING ORDER CANCELLATION EMAIL UNIT TESTS ===\n");

// Mock Online Paid Order
const sampleOnlineOrder = {
  orderId: "ZSK-2026-9901",
  customerName: "Rahul Sharma",
  customerEmail: "rahul@example.com",
  total: 650,
  payment: {
    method: "ONLINE",
    status: "paid",
  },
  items: [
    { name: "Blazer", qty: 1, price: 250, service: "Dry Clean" },
    { name: "Shirt", qty: 2, price: 200, service: "Iron" },
  ],
};

// 1. Verify Company Cancellation Email Content (Online Paid)
const emailHtml1 = generateOrderCancelledEmail(sampleOnlineOrder, "Store area temporarily unserviceable");
assert(typeof emailHtml1 === "string" && emailHtml1.length > 100, "Generated HTML email string exists");
assert(emailHtml1.includes("Rahul Sharma"), "Includes customer name");
assert(emailHtml1.includes("ZSK-2026-9901"), "Includes order ID");
assert(emailHtml1.includes("Store area temporarily unserviceable"), "Includes custom cancellation reason");
assert(emailHtml1.includes("Refund Initiated"), "Online paid order shows refund initiated section");
assert(emailHtml1.includes("5-7 business days"), "Mentions 5-7 business days refund turnaround");
assert(emailHtml1.includes("Blazer"), "Includes ordered items");
assert(emailHtml1.includes("₹650"), "Includes order total");

// 2. Verify Company Cancellation Email Content (COD Order)
const sampleCodOrder = {
  orderId: "ZSK-2026-9902",
  customerName: "Priya Singh",
  customerEmail: "priya@example.com",
  total: 420,
  payment: {
    method: "COD",
    status: "cod",
  },
  items: [
    { name: "Curtains", qty: 2, price: 210, service: "Wash & Iron" },
  ],
};

const emailHtml2 = generateOrderCancelledEmail(sampleCodOrder);
assert(emailHtml2.includes("Payment Notice"), "COD order shows Payment Notice instead of Refund Initiated");
assert(emailHtml2.includes("no amount was charged or deducted"), "COD order explicitly informs customer no money was deducted");
assert(emailHtml2.includes("Priya Singh"), "Includes COD customer name");
assert(emailHtml2.includes("ZSK-2026-9902"), "Includes COD order ID");

console.log("\nALL CANCELLATION EMAIL TESTS PASSED SUCCESSFULLY! ✅");


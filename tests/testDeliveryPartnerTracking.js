// Test Suite for Delivery Partner Tracking Data & Privacy Sanitization
import assert from "node:assert";

// Mock the formatting logic from order.controller.js
const formatPublicPartner = (partnerDoc) => {
  if (!partnerDoc) return null;
  return {
    fullName: partnerDoc.fullName || "",
    avatar: partnerDoc.avatar || "",
    mobileNumber: partnerDoc.mobileNumber || "",
  };
};

const formatPartnerAssignment = (assignment, legacyAgent = null) => {
  if (assignment && assignment.partnerId) {
    const p = assignment.partnerId;
    return {
      partner: formatPublicPartner(p),
      assignedAt: assignment.assignedAt || null,
      status: assignment.status || "assigned",
      pickedUpAt: assignment.pickedUpAt || null,
      deliveredAt: assignment.deliveredAt || null,
    };
  }
  if (legacyAgent && (legacyAgent.name || legacyAgent.phone)) {
    return {
      partner: {
        fullName: legacyAgent.name || "",
        avatar: "",
        mobileNumber: legacyAgent.phone || "",
      },
      assignedAt: null,
      status: "assigned",
      pickedUpAt: null,
      deliveredAt: null,
    };
  }
  return null;
};

console.log("===============================================================");
console.log("       ZUSKO DELIVERY PARTNER TRACKING - PRIVACY & DATA SUITE  ");
console.log("===============================================================\n");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// Scenario 1: Unassigned Partner
test("1. Unassigned pickup and delivery partner return null", () => {
  const pickup = formatPartnerAssignment(null);
  const delivery = formatPartnerAssignment(null);
  assert.strictEqual(pickup, null);
  assert.strictEqual(delivery, null);
});

// Scenario 2: Partner Assigned with full MongoDB DeliveryPartner document (Strict Sanitization)
test("2. Sanitizes pickup partner to ONLY fullName, avatar, and mobileNumber", () => {
  const rawDbPartner = {
    _id: "507f1f77bcf86cd799439011",
    partnerId: "DP-1001",
    fullName: "Ramesh Kumar",
    mobileNumber: "9876543210",
    avatar: "https://zusko.in/avatars/ramesh.jpg",
    email: "ramesh.private@gmail.com",
    address: "123 Private Street, Delhi",
    vehicleNumber: "DL 01 AB 1234",
    vehicleType: "Motorcycle",
    isActive: true,
    availabilityStatus: "Busy",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const assignment = {
    partnerId: rawDbPartner,
    assignedAt: new Date("2026-11-12T10:00:00Z"),
    assignedBy: "admin_user_id_999",
    status: "on-the-way",
    pickedUpAt: null,
  };

  const formatted = formatPartnerAssignment(assignment);

  assert.ok(formatted, "Formatted object should exist");
  assert.ok(formatted.partner, "Partner details should exist");
  assert.strictEqual(formatted.partner.fullName, "Ramesh Kumar");
  assert.strictEqual(formatted.partner.avatar, "https://zusko.in/avatars/ramesh.jpg");
  assert.strictEqual(formatted.partner.mobileNumber, "9876543210");

  // STRICT PRIVACY VERIFICATION: ensure NO private fields are leaked
  assert.strictEqual(formatted.partner.email, undefined);
  assert.strictEqual(formatted.partner.address, undefined);
  assert.strictEqual(formatted.partner.vehicleNumber, undefined);
  assert.strictEqual(formatted.partner.vehicleType, undefined);
  assert.strictEqual(formatted.partner.partnerId, undefined);
  assert.strictEqual(formatted.partner._id, undefined);
  assert.strictEqual(formatted.assignedBy, undefined);

  // Status and timestamp checks
  assert.strictEqual(formatted.status, "on-the-way");
  assert.deepStrictEqual(formatted.assignedAt, new Date("2026-11-12T10:00:00Z"));
});

// Scenario 3: Delivery Partner Assigned
test("3. Delivery partner assignment formatting and completion", () => {
  const rawDeliveryPartner = {
    _id: "507f1f77bcf86cd799439022",
    fullName: "Sunil Verma",
    mobileNumber: "9123456789",
    avatar: "https://zusko.in/avatars/sunil.jpg",
    vehicleNumber: "DL 05 XY 9876",
  };

  const deliveryAssignment = {
    partnerId: rawDeliveryPartner,
    assignedAt: new Date("2026-11-12T14:30:00Z"),
    status: "completed",
    deliveredAt: new Date("2026-11-12T16:00:00Z"),
  };

  const formatted = formatPartnerAssignment(deliveryAssignment);
  assert.strictEqual(formatted.partner.fullName, "Sunil Verma");
  assert.strictEqual(formatted.partner.mobileNumber, "9123456789");
  assert.strictEqual(formatted.status, "completed");
  assert.deepStrictEqual(formatted.deliveredAt, new Date("2026-11-12T16:00:00Z"));
  assert.strictEqual(formatted.partner.vehicleNumber, undefined);
});

// Scenario 4: Legacy deliveryAgent fallback
test("4. Gracefully formats legacy deliveryAgent when deliveryPartner unassigned", () => {
  const legacyAgent = {
    name: "Vikram Singh",
    phone: "9988776655",
    agentId: "old_agent_id_333",
  };

  const formatted = formatPartnerAssignment(null, legacyAgent);
  assert.ok(formatted);
  assert.strictEqual(formatted.partner.fullName, "Vikram Singh");
  assert.strictEqual(formatted.partner.mobileNumber, "9988776655");
  assert.strictEqual(formatted.partner.avatar, "");
  assert.strictEqual(formatted.partner.agentId, undefined);
});

console.log("\n===============================================================");
console.log(`TOTAL PRIVACY & TRACKING TESTS PASSED: ${passed}/4`);
console.log("===============================================================\n");


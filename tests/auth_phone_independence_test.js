import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import OTP from "../models/EmailOTP.js";
import { loginUser } from "../controllers/auth.controller.js";
import { updateProfile } from "../controllers/user.controller.js";
import { loginValidation } from "../validators/auth.validator.js";
import { validationResult } from "express-validator";

// Mock helper to run express-validator middleware chain
async function testValidation(body) {
  const req = { body };
  for (const middleware of loginValidation) {
    await middleware.run(req);
  }
  return validationResult(req);
}

// Mock express response
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runAuthTests() {
  console.log("=== STARTING AUTH PHONE INDEPENDENCE TESTS ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  const testEmail1 = `test_phone_indep_1_${Date.now()}@example.com`;
  const testEmail2 = `test_phone_indep_2_${Date.now()}@example.com`;
  const sharedPhone = "9998887776";
  const dummyOtp = "123456";

  try {
    await connectDB();

    // 1. Validator Tests
    console.log("--- 1. Validation Rules ---");
    const valOnlyEmailAndOtp = await testValidation({ email: testEmail1, otp: dummyOtp });
    assert(valOnlyEmailAndOtp.isEmpty(), "Validator passes with only email & otp (phone & name omitted)");

    const valMissingEmail = await testValidation({ otp: dummyOtp });
    assert(!valMissingEmail.isEmpty() && valMissingEmail.array().some(e => e.path === "email"), "Validator fails when email is missing");

    const valMissingOtp = await testValidation({ email: testEmail1 });
    assert(!valMissingOtp.isEmpty() && valMissingOtp.array().some(e => e.path === "otp"), "Validator fails when otp is missing");

    // 2. Setup OTP records in DB
    await OTP.create({
      email: testEmail1.toLowerCase(),
      otp: dummyOtp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    await OTP.create({
      email: testEmail2.toLowerCase(),
      otp: dummyOtp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // 3. Login User 1 with shared phone
    console.log("\n--- 2. Login User 1 with Phone ---");
    const req1 = {
      body: {
        email: testEmail1,
        otp: dummyOtp,
        phone: sharedPhone,
        name: "User One",
      },
    };
    const res1 = createMockRes();
    await loginUser(req1, res1);
    assert(res1.statusCode === 200 && res1.body.success, "User 1 successfully logged in / created");
    assert(res1.body.user.phone === sharedPhone, "User 1 saved phone as profile info");

    // 4. Login User 2 with the SAME phone (independent phone functionality)
    console.log("\n--- 3. Login User 2 with SAME Phone (Independence check) ---");
    const req2 = {
      body: {
        email: testEmail2,
        otp: dummyOtp,
        phone: sharedPhone, // duplicate phone
        name: "User Two",
      },
    };
    const res2 = createMockRes();
    await loginUser(req2, res2);
    assert(res2.statusCode === 200 && res2.body.success, "User 2 successfully logged in despite using the same phone number");
    assert(res2.body.user.phone === sharedPhone, "User 2 saved shared phone without conflict");
    assert(res2.body.user._id.toString() !== res1.body.user._id.toString(), "User 1 and User 2 are distinct accounts");

    // 5. Login User without phone (Phone is completely optional)
    console.log("\n--- 4. Login without Phone Field ---");
    const testEmail3 = `test_no_phone_${Date.now()}@example.com`;
    await OTP.create({
      email: testEmail3.toLowerCase(),
      otp: dummyOtp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const req3 = {
      body: {
        email: testEmail3,
        otp: dummyOtp,
      },
    };
    const res3 = createMockRes();
    await loginUser(req3, res3);
    assert(res3.statusCode === 200 && res3.body.success, "User created and logged in with zero phone information provided");
    assert(res3.body.user.name === "Guest", "Default name is 'Guest' when omitted");

    // 6. Test updateProfile with shared phone
    console.log("\n--- 5. Profile Update Phone Independence ---");
    const updateReq = {
      user: { id: res3.body.user._id },
      body: {
        phone: sharedPhone, // updating to same phone used by user 1 and user 2
      },
    };
    const updateRes = createMockRes();
    await updateProfile(updateReq, updateRes);
    assert(updateRes.statusCode === 200 && updateRes.body.success, "User 3 successfully updated profile with existing phone number without error");

    // Cleanup test data
    console.log("\n--- Cleaning up test records ---");
    await User.deleteMany({
      email: { $in: [testEmail1.toLowerCase(), testEmail2.toLowerCase(), testEmail3.toLowerCase()] },
    });
    await OTP.deleteMany({
      email: { $in: [testEmail1.toLowerCase(), testEmail2.toLowerCase(), testEmail3.toLowerCase()] },
    });
    console.log("Cleanup complete.");

    console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("Test execution failed with error:", error);
    process.exit(1);
  }
}

runAuthTests();

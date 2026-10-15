import express from "express";
import http from "http";
import { generalLimiter } from "../middleware/rateLimiter.js";
import { createRedisRateLimiter } from "../middleware/redisRateLimiter.js";

async function runProxyTests() {
  console.log("=== STARTING REVERSE PROXY & RATE LIMITING SECURITY TESTS ===\n");
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

  const app = express();
  // Match production server.js configuration
  app.set("trust proxy", "loopback");

  // Endpoint 1: Inspect resolved client IP
  app.get("/test/ip", (req, res) => {
    res.json({
      ip: req.ip,
      ips: req.ips,
    });
  });

  // Endpoint 2: Test generalLimiter
  app.get("/test/general-limit", generalLimiter, (req, res) => {
    res.json({ success: true, ip: req.ip });
  });

  // Endpoint 3: Test custom redis/memory rate limiter (max 3 for testing)
  const testLimiter = createRedisRateLimiter({
    prefix: "rl:test:client",
    windowSeconds: 60,
    max: 3,
    message: "Rate limit exceeded for test",
  });
  app.get("/test/custom-limit", testLimiter, (req, res) => {
    res.json({ success: true, ip: req.ip });
  });

  const server = http.createServer(app);
  const PORT = 5059;

  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  try {
    // ---------------------------------------------------------------
    // 1. Verify Client IP Resolution Behind Loopback Proxy (Nginx)
    // ---------------------------------------------------------------
    console.log("--- 1. Client IP Resolution Behind Proxy ---");

    const resA = await fetch(`http://127.0.0.1:${PORT}/test/ip`, {
      headers: { "X-Forwarded-For": "203.0.113.10" },
    });
    const dataA = await resA.json();
    assert(dataA.ip === "203.0.113.10", `Client IP correctly resolved to 203.0.113.10 (got ${dataA.ip})`);

    const resB = await fetch(`http://127.0.0.1:${PORT}/test/ip`, {
      headers: { "X-Forwarded-For": "198.51.100.25" },
    });
    const dataB = await resB.json();
    assert(dataB.ip === "198.51.100.25", `Client IP correctly resolved to 198.51.100.25 (got ${dataB.ip})`);

    // ---------------------------------------------------------------
    // 2. Verify Spoofed Header Protection
    // ---------------------------------------------------------------
    console.log("\n--- 2. Header Spoofing Protection ---");

    // Attacker sends: "spoofed_ip, real_client_ip" (Nginx appends real_client_ip)
    const spoofRes = await fetch(`http://127.0.0.1:${PORT}/test/ip`, {
      headers: { "X-Forwarded-For": "1.1.1.1, 203.0.113.50" },
    });
    const spoofData = await spoofRes.json();
    assert(
      spoofData.ip === "203.0.113.50",
      `Spoofed IP 1.1.1.1 ignored; actual client IP 203.0.113.50 used (got ${spoofData.ip})`
    );

    // ---------------------------------------------------------------
    // 3. Verify Rate Limiting Bucket Isolation Between Different IPs
    // ---------------------------------------------------------------
    console.log("\n--- 3. Rate Limit Bucket Isolation ---");

    // Client A makes 3 requests (exhausting its quota of 3)
    const ipA = "203.0.113.100";
    for (let i = 1; i <= 3; i++) {
      await fetch(`http://127.0.0.1:${PORT}/test/custom-limit`, {
        headers: { "X-Forwarded-For": ipA },
      });
    }

    // 4th request from Client A should be blocked (429)
    const blockedA = await fetch(`http://127.0.0.1:${PORT}/test/custom-limit`, {
      headers: { "X-Forwarded-For": ipA },
    });
    assert(blockedA.status === 429, `Client A (${ipA}) is correctly rate-limited (status 429)`);

    // Client B from different IP (198.51.100.200) makes a request
    const ipB = "198.51.100.200";
    const allowedB = await fetch(`http://127.0.0.1:${PORT}/test/custom-limit`, {
      headers: { "X-Forwarded-For": ipB },
    });
    assert(
      allowedB.status === 200,
      `Client B (${ipB}) is NOT affected by Client A's limit (status 200)`
    );

    // ---------------------------------------------------------------
    // 4. Verify Attacker Cannot Bypass Rate Limit by Altering Spoofed Prefix
    // ---------------------------------------------------------------
    console.log("\n--- 4. Attacker Bypass Prevention ---");

    // Attacker on ipA tries to forge different preceding IPs: "9.9.9.9, 203.0.113.100"
    const bypassAttempt = await fetch(`http://127.0.0.1:${PORT}/test/custom-limit`, {
      headers: { "X-Forwarded-For": `9.9.9.9, ${ipA}` },
    });
    assert(
      bypassAttempt.status === 429,
      `Attacker on ${ipA} cannot bypass rate limit by prefixing spoofed IPs (status 429)`
    );

    console.log("\n=== SUMMARY ===");
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failed}`);

    server.close();
    if (failed === 0) {
      console.log("\nALL PROXY & RATE LIMIT TESTS PASSED!");
      process.exit(0);
    } else {
      console.error("\nSOME PROXY TESTS FAILED!");
      process.exit(1);
    }
  } catch (error) {
    console.error("Test error:", error);
    server.close();
    process.exit(1);
  }
}

runProxyTests();

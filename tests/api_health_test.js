import app from "../server.js";
import http from "http";

const server = http.createServer(app);
const PORT = 5055;

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    const data = await res.json();
    console.log("Health response status:", res.status);
    console.log("Health response body:", data);

    if (res.status === 200 && data.status === "healthy") {
      console.log("[PASS] /health endpoint functions correctly");
      server.close(() => process.exit(0));
    } else {
      console.error("[FAIL] /health unexpected response");
      server.close(() => process.exit(1));
    }
  } catch (err) {
    console.error("[FAIL] Health check request failed:", err.message);
    server.close(() => process.exit(1));
  }
});

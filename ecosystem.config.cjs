module.exports = {
  apps: [
    {
      name: "zusko-user-api",
      script: "server.js",
      // Multi-process cluster mode: utilizes all available CPU cores to handle heavy concurrent traffic
      instances: process.env.WEB_CONCURRENCY || "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      // Zero-downtime reload orchestration: waits for process.send('ready') from server.js
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 6000,
      exp_backoff_restart_delay: 100, // Exponential backoff to avoid crash-loop CPU thrashing
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "zusko-user-worker",
      script: "worker.js",
      // Worker remains singleton in fork mode to prevent duplicate BullMQ job executions
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      kill_timeout: 6000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

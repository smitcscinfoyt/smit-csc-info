import app from "./app";
import { logger } from "./lib/logger";
import { startPrimeReminderScheduler, stopPrimeReminderScheduler } from "./lib/prime-reminders";
import { syncYoutubeChannel } from "./lib/youtube-sync";

const KNOWN_BAD_SECRETS = new Set([
  "dev-secret-change-me",
  "dev-session-secret-change-me",
  "secure_db_password",
  "CHANGE_ME",
  "CHANGE_ME_DB_PASSWORD",
]);

function validateRequiredEnv(): void {
  const required: Record<string, string> = {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    SESSION_SECRET: process.env.SESSION_SECRET ?? "",
  };

  if (process.env.JWT_SECRET) {
    required.JWT_SECRET = process.env.JWT_SECRET;
  }

  for (const [name, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`[Startup Error] Required environment variable ${name} is not set. See OWNER_ACTIONS.md.`);
    }
    if (KNOWN_BAD_SECRETS.has(value) || value.includes("secure_db_password") || value.includes("dev-secret-change-me")) {
      throw new Error(
        `[Startup Error] ${name} is set to a known insecure placeholder ("${value}"). Please update it before deploying. See OWNER_ACTIONS.md.`
      );
    }
  }
}

// Enforce required secrets validation in production
if (process.env.NODE_ENV === "production") {
  validateRequiredEnv();
}

// PORT in .env is the Vite dev server; API_PORT is the Express listener.
const rawPort = process.env["API_PORT"] ?? process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "API_PORT or PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

let ytSyncInterval: NodeJS.Timeout | null = null;

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  startPrimeReminderScheduler();

  // Initial YouTube sync on startup (non-blocking)
  syncYoutubeChannel().catch((err) => {
    logger.warn({ err: err?.message }, "Initial YouTube sync failed, will retry on timer");
  });

  // Periodic YouTube sync every 6 hours
  ytSyncInterval = setInterval(() => {
    syncYoutubeChannel().catch((err) => {
      logger.warn({ err: err?.message }, "Periodic YouTube sync failed");
    });
  }, 6 * 60 * 60 * 1000);
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Received shutdown signal, closing server");
  stopPrimeReminderScheduler();
  if (ytSyncInterval) clearInterval(ytSyncInterval);
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 5000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

import app from "./app";
import { logger } from "./lib/logger";
import { startPrimeReminderScheduler, stopPrimeReminderScheduler } from "./lib/prime-reminders";
import { syncYoutubeChannel } from "./lib/youtube-sync";

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

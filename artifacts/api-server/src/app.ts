import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// We sit behind Replit's edge proxy or system Nginx (single hop).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Security Headers via Helmet (CSP managed by Nginx)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Restricted CORS Allowlist
const ALLOWED_ORIGINS = [
  "https://smitcscinfo.com",
  "https://www.smitcscinfo.com",
  process.env.SITE_URL,
  process.env.APP_URL,
].filter((o): o is string => Boolean(o));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== "production") {
        if (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }
      return callback(new Error(`CORS: Origin ${origin} not allowed by policy`));
    },
    credentials: true,
  })
);
// Bumped from the express default (~100KB) so the Vision OCR proxy can
// accept base64-encoded crops up to ~12MB raw. The vision route enforces
// its own per-request cap; this just keeps express from rejecting them
// before they reach the handler.
app.use(
  express.json({
    limit: "16mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "16mb" }));

app.use("/api", router);

// Global JSON error handler — must be the last middleware.
// Without this, Express 5 falls back to its default HTML error page,
// which apiFetch cannot parse and the user sees a generic "Something went wrong" toast.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status: number = typeof err?.status === "number" ? err.status
    : typeof err?.statusCode === "number" ? err.statusCode
    : 500;
  const message: string = err?.message ?? "Internal server error";
  logger.error({ err, status }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;

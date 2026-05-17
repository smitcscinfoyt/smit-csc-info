import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// We sit behind Replit's edge proxy (single hop). Tell Express to honour
// only the first proxy in the chain so `req.ip` reflects the real client
// instead of the loopback that the proxy connects from. Crucially, this
// prevents IP-spoofing of our per-IP rate limiters: setting `trust proxy`
// to a *count* (not `true`) tells Express to drop any extra entries an
// attacker may have prepended to `X-Forwarded-For` and use only the
// right-most one (i.e. the IP added by our trusted proxy).
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
app.use(cors());
// Bumped from the express default (~100KB) so the Vision OCR proxy can
// accept base64-encoded crops up to ~12MB raw. The vision route enforces
// its own per-request cap; this just keeps express from rejecting them
// before they reach the handler.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true, limit: "16mb" }));

app.use("/api", router);

export default app;

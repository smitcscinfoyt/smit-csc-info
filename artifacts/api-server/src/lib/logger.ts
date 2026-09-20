import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      // HTTP headers
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      // Auth / account fields anywhere in the log object
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.resetToken",
      "*.idToken",
      "*.accessToken",
      "*.refreshToken",
      "*.sessionSecret",
      // KYC / PII fields
      "*.panNumber",
      "*.aadhaarLast4",
      "*.ocrPanExtracted",
      "*.ocrAadhaarExtracted",
      "*.mobile",
      "*.phone",
      "*.billingMobile",
      // Payment / secrets
      "*.tpin",
      "*.saltKey",
      "*.webhookSecret",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

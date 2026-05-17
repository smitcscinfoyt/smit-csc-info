import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
// Cap base64 payload at ~12MB. Vision itself accepts up to 20MB, but
// anything above this almost always means the caller forgot to crop —
// rejecting early gives a cleaner error than a 30-second timeout.
const MAX_BASE64_LEN = 12 * 1024 * 1024;

/**
 * Server-side proxy for Google Cloud Vision OCR.
 *
 * The browser sends a base64-encoded PNG of just the cropped region the
 * user wants re-scanned. We forward to Vision with our server-only API
 * key and return the raw response (textAnnotations + fullTextAnnotation)
 * so the client can map vertices back to canvas/display coordinates.
 *
 * Why this lives on the server:
 *  - The API key would leak instantly if the browser called Vision directly.
 *  - One central place to log, rate-limit, and (later) meter per-user usage.
 */
router.post(
  "/tools/vision-ocr",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error:
          "Google AI engine is not configured yet. Please contact support.",
      });
      return;
    }

    let { imageBase64, feature } = (req.body ?? {}) as {
      imageBase64?: string;
      feature?: string;
    };
    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    // Accept either a raw base64 string or a full data: URL.
    const m = imageBase64.match(/^data:[^;]+;base64,(.*)$/);
    if (m) imageBase64 = m[1];

    if (imageBase64.length > MAX_BASE64_LEN) {
      res.status(413).json({
        error: "Selection too large. Try a tighter box around the text.",
      });
      return;
    }

    // DOCUMENT_TEXT_DETECTION is the right mode for forms, certificates,
    // and other dense-text imagery. TEXT_DETECTION is for sparse scenes.
    const featureType =
      feature === "TEXT_DETECTION" ? "TEXT_DETECTION" : "DOCUMENT_TEXT_DETECTION";

    try {
      const upstream = await fetch(
        `${VISION_URL}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: imageBase64 },
                features: [{ type: featureType, maxResults: 1 }],
                imageContext: { languageHints: ["en"] },
              },
            ],
          }),
        },
      );

      if (!upstream.ok) {
        const text = await upstream.text();
        logger.warn(
          { status: upstream.status, body: text.slice(0, 400) },
          "google vision upstream failed",
        );
        if (upstream.status === 429) {
          res
            .status(429)
            .json({ error: "Google AI quota reached. Please try later." });
          return;
        }
        if (upstream.status === 403) {
          res.status(503).json({
            error:
              "Google AI engine rejected the request. Please contact support.",
          });
          return;
        }
        res.status(502).json({ error: "Google AI engine returned an error." });
        return;
      }

      const json = (await upstream.json()) as any;
      const r0 = json?.responses?.[0] ?? {};
      if (r0.error) {
        logger.warn({ err: r0.error }, "google vision response.error");
        // Vision returns logical errors inside a 200 envelope using
        // google.rpc.Code numeric values. Translate the ones the user
        // can act on so the editor surfaces the right message:
        //   8  = RESOURCE_EXHAUSTED  → 429 (free-tier exhausted)
        //   7  = PERMISSION_DENIED   → 503 (key disabled / Vision API not enabled)
        //   16 = UNAUTHENTICATED     → 503 (key invalid)
        const code = Number(r0.error?.code);
        if (code === 8) {
          res.status(429).json({
            error: "Google AI quota reached. Please try later.",
          });
          return;
        }
        if (code === 7 || code === 16) {
          res.status(503).json({
            error:
              "Google AI engine isn't configured correctly. Please contact support.",
          });
          return;
        }
        res
          .status(502)
          .json({ error: r0.error?.message ?? "Google AI engine error" });
        return;
      }

      // Forward only the parts the editor uses — keeps payload small and
      // means the contract isn't accidentally tied to Google response shape.
      res.json({
        fullTextAnnotation: r0.fullTextAnnotation ?? null,
        textAnnotations: Array.isArray(r0.textAnnotations)
          ? r0.textAnnotations
          : [],
      });
    } catch (err) {
      logger.error({ err }, "google vision call failed");
      res
        .status(502)
        .json({ error: "Could not reach Google AI engine. Please try again." });
    }
  },
);

export default router;

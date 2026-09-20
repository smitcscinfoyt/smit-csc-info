import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { or, eq } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { createRateLimiter, clientIp } from "../lib/rate-limit";
import { db, kycRecordsTable } from "@workspace/db";

const router: IRouter = Router();
const uploadRateLimiter = createRateLimiter({ windowMs: 60_000, max: 25 });
const objectStorageService = new ObjectStorageService();
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_NAME_LENGTH = 255;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const rateLimitKey = req.userId ? `user:${req.userId}` : `ip:${clientIp(req)}`;
    const rl = uploadRateLimiter(rateLimitKey);
    if (!rl.ok) {
      res.status(429).json({
        error: "Rate limit exceeded. Please wait a moment before requesting another upload.",
        retryAfter: rl.retryAfter,
      });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const name = parsed.data.name.trim();
    const contentType = parsed.data.contentType.trim().toLowerCase();
    const size = parsed.data.size;

    if (!name || name.length > MAX_UPLOAD_NAME_LENGTH) {
      res.status(400).json({
        error: `File name is required and must be ${MAX_UPLOAD_NAME_LENGTH} characters or fewer`,
      });
      return;
    }

    if (!Number.isSafeInteger(size) || size <= 0) {
      res.status(400).json({ error: "File size must be a positive integer" });
      return;
    }

    if (size > MAX_UPLOAD_SIZE_BYTES) {
      res.status(413).json({ error: "File is too large. Maximum upload size is 10 MB." });
      return;
    }

    if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) {
      res.status(415).json({
        error: "Unsupported file type. Allowed types are PDF, Word, PowerPoint, JPEG, and PNG.",
      });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*path
 *
 * Serve private object entities from PRIVATE_OBJECT_DIR.
 *
 * Access rules:
 *  - Must be authenticated (valid JWT).
 *  - Admin / manager roles can access any object.
 *  - Regular users can only access objects whose path appears in their own
 *    KYC record (panImageUrl, aadhaarFrontUrl, aadhaarBackUrl, selfieUrl).
 *
 * OWNER NOTE: Before redeploying this change, ensure all KYC files previously
 * served via the ./attached_assets Nginx static mount are copied to the GCS
 * private bucket. See OWNER_ACTIONS.md § "KYC File Backup".
 */
router.get(
  "/storage/objects/*path",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      const requestingUserId = req.userId!;
      const isPrivileged =
        req.userRole === "admin" || req.userRole === "manager";

      if (!isPrivileged) {
        // Ownership check: the requested path must appear in one of the four
        // KYC document URL columns for the requesting user's KYC record.
        const [record] = await db
          .select({ userId: kycRecordsTable.userId })
          .from(kycRecordsTable)
          .where(
            or(
              eq(kycRecordsTable.panImageUrl, objectPath),
              eq(kycRecordsTable.aadhaarFrontUrl, objectPath),
              eq(kycRecordsTable.aadhaarBackUrl, objectPath),
              eq(kycRecordsTable.selfieUrl, objectPath),
            ),
          )
          .limit(1);

        if (!record) {
          // Path not found in any KYC record — deny without revealing existence.
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        if (record.userId !== requestingUserId) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }

      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        req.log.warn({ err: error }, "Object not found");
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

export default router;

import { Router } from "express";
import { db, documentsTable, documentAccessLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { requireAdminOrManager, optionalAuth, headerOnlyAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";
import { canAccessPrimeDocuments } from "../lib/prime-status";
import { addWatermarkToPdf } from "../lib/pdf-watermark";
import { generatePdfPreview } from "../lib/pdf-preview";
import {
  GetDocumentsResponse,
  GetDocumentsResponseItem,
  AdminCreateDocumentBody,
  AdminDeleteDocumentParams,
} from "@workspace/api-zod";

const router = Router();

const previewLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 30 });
const downloadLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 10 });
const downloadTickets = new Map<string, { docId: number, format: 'pdf'|'word', userId: number, expires: number }>();

function getAttachedAssetsDir(): string {
  const candidate1 = path.resolve(process.cwd(), "attached_assets");
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.resolve(process.cwd(), "..", "..", "attached_assets");
  if (fs.existsSync(candidate2)) return candidate2;
  return candidate1;
}

export async function getDocumentBuffer(urlOrPath: string): Promise<Buffer> {
  if (!urlOrPath.startsWith("http://") && !urlOrPath.startsWith("https://")) {
    const assetsDir = getAttachedAssetsDir();
    const cleanRel = urlOrPath.replace(/^\/?(attached_assets\/|api\/storage\/)?/, "");
    const possiblePaths = [
      path.resolve(assetsDir, cleanRel),
      path.resolve(assetsDir, "documents", cleanRel),
      path.resolve(assetsDir, "documents", path.basename(cleanRel)),
      path.resolve(process.cwd(), urlOrPath),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.promises.readFile(p);
      }
    }
  }

  const resp = await fetch(urlOrPath);
  if (!resp.ok) {
    throw new Error(`Failed to fetch file from ${urlOrPath}: ${resp.statusText}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

router.get("/documents", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  let query = db.select().from(documentsTable).$dynamic();

  const conditions = [];
  if (req.query.category && req.query.category !== "All") {
    conditions.push(eq(documentsTable.category, req.query.category as string));
  }
  if (req.query.isPrime !== undefined) {
    conditions.push(eq(documentsTable.isPrime, req.query.isPrime === "true"));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const docs = await query.orderBy(documentsTable.createdAt);

  const upgradeEnabled = process.env.DOCS_UPGRADE_ENABLED === "true";
  let isPrimeAccess = false;

  if (upgradeEnabled && req.userId) {
    const { canAccessPrimeDocuments } = await import("../lib/prime-status");
    isPrimeAccess = await canAccessPrimeDocuments(req.userId, req.userRole);
  } else if (!upgradeEnabled && req.userId) {
    const { getActivePrime } = await import("./credits");
    isPrimeAccess = !!(await getActivePrime(req.userId));
  }
  
  const canSeeUrls = !upgradeEnabled || isPrimeAccess;

  res.json(
    GetDocumentsResponse.parse(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        fileUrl: canSeeUrls ? d.fileUrl : "",
        fileName: d.fileName,
        fileType: d.fileType,
        category: d.category,
        isPrime: d.isPrime,
        accessLevel: d.accessLevel ?? (d.isPrime ? "prime_only" : "public"),
        groupId: d.groupId ?? null,
        wordUrl: canSeeUrls ? (d.wordUrl ?? null) : null,
        wordFileName: d.wordFileName ?? null,
        createdAt: d.createdAt.toISOString(),
      }))
    )
  );
});

router.get("/documents/:id/preview", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const docId = Number(req.params.id);
  if (Number.isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId)).limit(1);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // 1. Logged-out users must log in to view preview (Section 4)
  if (!req.userId) {
    res.status(401).json({ error: "login_required", message: "Please log in to preview this document." });
    return;
  }

  const requesterIsPrime = await canAccessPrimeDocuments(req.userId, req.userRole);

  try {
    if (process.env.DOCS_UPGRADE_ENABLED === "true") {
      if (!requesterIsPrime) {
        res.status(403).json({ error: "Upgrade required", message: "Legacy preview is disabled for Free users. Upgrade or use the new UI." });
        return;
      }
    }

    const pdfBuffer = await getDocumentBuffer(doc.fileUrl);

    const encoded = encodeURIComponent(doc.fileName);
    const asciiFallback = doc.fileName.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);

    if (requesterIsPrime) {
      res.send(pdfBuffer);
    } else {
      const watermarked = await addWatermarkToPdf(pdfBuffer, "Smit CSC Info");
      res.send(watermarked);
    }
  } catch (err: any) {
    req.log.error({ err, docId: doc.id }, "Failed to generate document preview");
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

// ---------------------------------------------------------
// NEW PIPELINE ENDPOINTS (v2)
// ---------------------------------------------------------

router.get("/documents/:id/preview-v2", previewLimiter, headerOnlyAuth, async (req: AuthRequest, res): Promise<void> => {
  const docId = Number(req.params.id);
  if (Number.isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" }); return;
  }
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId)).limit(1);
  if (!doc) {
    res.status(404).json({ error: "Document not found" }); return;
  }

  try {
    const isPrime = await canAccessPrimeDocuments(req.userId!, req.userRole);
    const cacheDir = process.env.PREVIEW_CACHE_DIR || path.join(process.cwd(), ".cache", "previews");
    const mode = isPrime ? "prime" : "free";
    const cachePath = path.join(cacheDir, mode, `${doc.id}.webp`);
    
    if (fs.existsSync(cachePath)) {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(cachePath);
      
      // Log access asynchronously
      db.insert(documentAccessLogTable).values({
        userId: req.userId!,
        documentId: doc.id,
        action: 'preview',
        format: 'webp',
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      }).catch(e => req.log.error("Failed to log preview access", e));
      return;
    }

    const pdfBuffer = await getDocumentBuffer(doc.fileUrl);
    
    const options = isPrime ? {} : { watermarkText: "Smit CSC Info", watermarkOpacity: 0.15, cropToHalf: true };
    await generatePdfPreview(pdfBuffer, cachePath, options);

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(cachePath);

    db.insert(documentAccessLogTable).values({
      userId: req.userId!, documentId: doc.id, action: 'preview', format: 'webp',
      ipAddress: req.ip, userAgent: req.headers["user-agent"]
    }).catch(e => req.log.error("Failed to log preview access", e));
    
  } catch (err: any) {
    req.log.error({ err, docId: doc.id }, "Preview V2 failed");
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

router.post("/documents/:id/download-ticket", downloadLimiter, headerOnlyAuth, async (req: AuthRequest, res): Promise<void> => {
  const docId = Number(req.params.id);
  const format = req.body.format === "word" ? "word" : "pdf";

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId)).limit(1);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const isPrime = await canAccessPrimeDocuments(req.userId!, req.userRole);
  const isPrimeGated = doc.isPrime || doc.accessLevel === "prime_only" || doc.accessLevel === "login_required" || ["Affidavits", "Forms"].includes(doc.category);
  
  if (isPrimeGated && !isPrime) {
    res.status(403).json({ error: "prime_required", message: "Prime membership required to download." });
    return;
  }

  // Generate short-lived ticket
  const ticket = crypto.randomBytes(16).toString('hex');
  downloadTickets.set(ticket, {
    docId,
    format,
    userId: req.userId!,
    expires: Date.now() + 60_000 // 1 minute
  });

  res.json({ ticket, downloadUrl: `/api/documents/download/${ticket}` });
});

router.get("/documents/download/:ticket", downloadLimiter, async (req, res): Promise<void> => {
  const ticket = req.params.ticket;
  const data = downloadTickets.get(ticket);
  
  if (!data || data.expires < Date.now()) {
    res.status(403).json({ error: "Invalid or expired download ticket" });
    return;
  }
  downloadTickets.delete(ticket);

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, data.docId)).limit(1);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const targetUrl = data.format === "word" ? (doc.wordUrl || doc.fileUrl) : doc.fileUrl;
  const targetName = data.format === "word" ? (doc.wordFileName || doc.fileName.replace(/\.pdf$/i, ".docx")) : doc.fileName;

  try {
    const fileBuf = await getDocumentBuffer(targetUrl);
    const contentType = data.format === "word"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";

    res.setHeader("Content-Type", contentType);
    const encoded = encodeURIComponent(targetName);
    const asciiFallback = targetName.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
    res.send(fileBuf);

    // Log access
    db.insert(documentAccessLogTable).values({
      userId: data.userId, documentId: doc.id, action: 'download', format: data.format,
      ipAddress: req.ip, userAgent: req.headers["user-agent"]
    }).catch(e => req.log.error("Failed to log download access", e));

  } catch (err: any) {
    req.log.error({ err, docId: doc.id }, "Failed to download document via ticket");
    res.status(500).json({ error: "Failed to download document" });
  }
});

// ---------------------------------------------------------

router.get("/documents/:id/download", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const docId = Number(req.params.id);
  if (Number.isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId)).limit(1);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // Logged-out users cannot download
  if (!req.userId) {
    res.status(401).json({ error: "login_required", message: "Please log in to download." });
    return;
  }

  const requesterIsPrime = await canAccessPrimeDocuments(req.userId, req.userRole);

  // Check if document requires Prime to download
  const isPrimeGated =
    doc.isPrime ||
    doc.accessLevel === "prime_only" ||
    doc.accessLevel === "login_required" ||
    ["Affidavits", "Forms"].includes(doc.category);

  if (isPrimeGated && !requesterIsPrime) {
    res.status(403).json({ error: "prime_required", message: "Prime membership required to download." });
    return;
  }

  const format = (req.query.format as string)?.toLowerCase() === "word" ? "word" : "pdf";
  const targetUrl = format === "word" ? (doc.wordUrl || doc.fileUrl) : doc.fileUrl;
  const targetName =
    format === "word"
      ? (doc.wordFileName || doc.fileName.replace(/\.pdf$/i, ".docx"))
      : doc.fileName;

  try {
    const fileBuf = await getDocumentBuffer(targetUrl);
    const contentType =
      format === "word"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";

    const encoded = encodeURIComponent(targetName);
    const asciiFallback = targetName.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
    res.send(fileBuf);
  } catch (err: any) {
    req.log.error({ err, docId: doc.id }, "Failed to download document");
    res.status(500).json({ error: "Failed to download document" });
  }
});

router.post("/admin/documents", requireAdminOrManager, async (req, res): Promise<void> => {
  const parsed = AdminCreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    title,
    description,
    fileUrl,
    fileName,
    fileType,
    category,
    isPrime,
    accessLevel,
    groupId,
    wordUrl,
    wordFileName,
  } = parsed.data;

  // Validate URL/path safety
  try {
    const u = new URL(fileUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      res.status(400).json({ error: "fileUrl must be http or https" });
      return;
    }
  } catch {
    if (!fileUrl.startsWith("/") && !fileUrl.startsWith("attached_assets/")) {
      res.status(400).json({ error: "fileUrl is not a valid URL or path" });
      return;
    }
  }

  const [doc] = await db
    .insert(documentsTable)
    .values({
      title,
      description: description ?? null,
      fileUrl,
      fileName,
      fileType,
      category: category ?? "General",
      isPrime: isPrime ?? false,
      accessLevel: accessLevel ?? (isPrime ? "prime_only" : "login_required"),
      groupId: groupId ?? null,
      wordUrl: wordUrl ?? null,
      wordFileName: wordFileName ?? null,
    })
    .returning();

  res.status(201).json(
    GetDocumentsResponseItem.parse({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      fileType: doc.fileType,
      category: doc.category,
      isPrime: doc.isPrime,
      accessLevel: doc.accessLevel,
      groupId: doc.groupId,
      wordUrl: doc.wordUrl,
      wordFileName: doc.wordFileName,
      createdAt: doc.createdAt.toISOString(),
    })
  );
});

router.delete("/admin/documents/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  const parsed = AdminDeleteDocumentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  await db.delete(documentsTable).where(eq(documentsTable.id, parsed.data.id));
  res.json({ success: true });
});

export default router;

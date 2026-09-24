import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { requireAdminOrManager, optionalAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";
import { addWatermarkToPdf } from "../lib/pdf-watermark";
import {
  GetDocumentsResponse,
  GetDocumentsResponseItem,
  AdminCreateDocumentBody,
  AdminDeleteDocumentParams,
} from "@workspace/api-zod";
import { PDFDocument } from "pdf-lib";

const router = Router();

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

  res.json(
    GetDocumentsResponse.parse(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        fileType: d.fileType,
        category: d.category,
        isPrime: d.isPrime,
        accessLevel: d.accessLevel ?? (d.isPrime ? "prime_only" : "public"),
        groupId: d.groupId ?? null,
        wordUrl: d.wordUrl ?? null,
        wordFileName: d.wordFileName ?? null,
        createdAt: d.createdAt.toISOString(),
      }))
    )
  );
});

router.get("/documents/:id/preview-v2", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const docId = Number(req.params.id);
  if (Number.isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  if (req.query.token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId)).limit(1);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  try {
    const pdfBuffer = await getDocumentBuffer(doc.fileUrl);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();

    const requesterIsPrime = !!(await getActivePrime(req.userId));

    if (requesterIsPrime) {
      res.json({ mode: "full", totalPages });
      return;
    }

    const { renderDocumentPreview } = await import("../lib/pdf-renderer");
    const result = await renderDocumentPreview(doc.id.toString(), pdfBuffer);
    res.json({
      mode: "free",
      images: result.images,
      totalPages: result.totalPages,
      previewPercent: result.previewPercent,
    });
  } catch (err: any) {
    req.log.error({ err, docId }, "Failed to process preview-v2");
    res.status(503).json({ error: "preview_unavailable", message: "Preview generation is temporarily unavailable" });
  }
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

  const requesterIsPrime = !!(await getActivePrime(req.userId));
  const upgradeEnabled = process.env.DOCS_UPGRADE_ENABLED === 'true';

  if (upgradeEnabled && !requesterIsPrime) {
    res.status(403).json({ error: "upgrade_required", message: "Raw PDF access requires Prime" });
    return;
  }

  try {
    const pdfBuffer = await getDocumentBuffer(doc.fileUrl);

    const encoded = encodeURIComponent(doc.fileName);
    const asciiFallback = doc.fileName.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);

    if (requesterIsPrime) {
      // Prime user: serve clean PDF without watermark
      res.send(pdfBuffer);
    } else {
      // Free user: dynamically stamp diagonal "Smit CSC Info" watermark
      const watermarked = await addWatermarkToPdf(pdfBuffer, "Smit CSC Info");
      res.send(watermarked);
    }
  } catch (err: any) {
    req.log.error({ err, docId: doc.id }, "Failed to generate document preview");
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

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

  const requesterIsPrime = !!(await getActivePrime(req.userId));
  const upgradeEnabled = process.env.DOCS_UPGRADE_ENABLED === 'true';

  if (upgradeEnabled && !requesterIsPrime) {
    res.status(403).json({ error: "upgrade_required", message: "Raw PDF access requires Prime" });
    return;
  }

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

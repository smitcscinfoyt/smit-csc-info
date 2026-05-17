import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdminOrManager, optionalAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";
import {
  GetDocumentsResponse,
  GetDocumentsResponseItem,
  AdminCreateDocumentBody,
  AdminDeleteDocumentParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/documents", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const requesterIsPrime = req.userId ? !!(await getActivePrime(req.userId)) : false;

  let query = db.select().from(documentsTable).$dynamic();

  const conditions = [];
  if (req.query.category) {
    conditions.push(eq(documentsTable.category, req.query.category as string));
  }
  if (req.query.isPrime !== undefined) {
    conditions.push(eq(documentsTable.isPrime, req.query.isPrime === "true"));
  }
  if (!requesterIsPrime) {
    conditions.push(eq(documentsTable.isPrime, false));
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
        createdAt: d.createdAt.toISOString(),
      }))
    )
  );
});

router.post("/admin/documents", requireAdminOrManager, async (req, res): Promise<void> => {
  const parsed = AdminCreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, fileUrl, fileName, fileType, category, isPrime } = parsed.data;

  // Reject anything that isn't a plain http(s) URL. Without this guard
  // the column accepts arbitrary strings (javascript:, data:, file:,
  // chrome:, etc.), and every place that renders <a href={doc.fileUrl}>
  // would become a stored-XSS / local-file disclosure sink.
  try {
    const u = new URL(fileUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      res.status(400).json({ error: "fileUrl must be http or https" });
      return;
    }
  } catch {
    res.status(400).json({ error: "fileUrl is not a valid URL" });
    return;
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

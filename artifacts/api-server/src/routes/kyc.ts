import { Router } from "express";
import { db, kycRecordsTable, walletsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin, type AuthRequest } from "../lib/auth";
import { ensureWallet } from "../lib/wallet-engine";
import { logger } from "../lib/logger";

const router = Router();

const submitBody = z.object({
  fullName: z.string().min(2).max(200),
  dob: z.string().min(8).max(20),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format"),
  aadhaarLast4: z.string().regex(/^[0-9]{4}$/, "Aadhaar last 4 digits"),
  addressLine: z.string().min(5).max(500),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  pincode: z.string().regex(/^[0-9]{6}$/, "Invalid pincode"),
  panImageUrl: z.string().url(),
  aadhaarFrontUrl: z.string().url(),
  aadhaarBackUrl: z.string().url(),
  selfieUrl: z.string().url(),
});

router.get("/kyc", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const [row] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, userId));
  if (!row) { res.json({ status: "none" }); return; }
  res.json(serializeKyc(row));
});

router.post("/kyc", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = submitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid KYC data", details: parsed.error.format() });
    return;
  }
  const data = parsed.data;
  const [existing] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, userId));
  if (existing && existing.status === "verified") {
    res.status(409).json({ error: "KYC already verified" });
    return;
  }

  if (existing) {
    const [updated] = await db.update(kycRecordsTable)
      .set({
        ...data,
        panNumber: data.panNumber.toUpperCase(),
        kycMethod: "manual",
        status: "pending",
        rejectReason: null,
        reviewedAt: null,
        reviewedBy: null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(kycRecordsTable.id, existing.id))
      .returning();
    await db.update(walletsTable).set({ kycLevel: "manual_pending", updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
    res.json(serializeKyc(updated!));
    return;
  }
  await ensureWallet(userId);
  const [created] = await db.insert(kycRecordsTable).values({
    userId,
    level: "full",
    status: "pending",
    kycMethod: "manual",
    fullName: data.fullName,
    dob: data.dob,
    panNumber: data.panNumber.toUpperCase(),
    aadhaarLast4: data.aadhaarLast4,
    addressLine: data.addressLine,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    panImageUrl: data.panImageUrl,
    aadhaarFrontUrl: data.aadhaarFrontUrl,
    aadhaarBackUrl: data.aadhaarBackUrl,
    selfieUrl: data.selfieUrl,
  }).returning();
  await db.update(walletsTable).set({ kycLevel: "manual_pending", updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
  res.json(serializeKyc(created));
});

router.post("/kyc/digital", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = submitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid KYC data", details: parsed.error.format() });
    return;
  }
  const data = parsed.data;

  const [existing] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, userId));
  if (existing && existing.status === "verified") {
    res.status(409).json({ error: "KYC already verified" });
    return;
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Digital KYC verification service is not configured" });
    return;
  }

  let ocrPanExtracted: string | null = null;
  let ocrNameExtracted: string | null = null;
  let ocrAadhaarExtracted: string | null = null;
  const mismatches: string[] = [];

  try {
    const panOcrText = await ocrImageFromUrl(data.panImageUrl, apiKey);
    logger.info({ ocrTextLength: panOcrText.length }, "[Digital KYC] PAN OCR complete");

    const panMatch = panOcrText.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
    if (panMatch) {
      ocrPanExtracted = panMatch[0];
    }

    const nameFromPan = extractNameFromPanOcr(panOcrText, data.panNumber.toUpperCase());
    if (nameFromPan) {
      ocrNameExtracted = nameFromPan;
    }

    if (!ocrPanExtracted) {
      mismatches.push("PAN number could not be read from the PAN card image. Please upload a clear photo.");
    } else if (ocrPanExtracted !== data.panNumber.toUpperCase()) {
      mismatches.push(`PAN mismatch: You entered ${data.panNumber.toUpperCase()} but image shows ${ocrPanExtracted}`);
    }

    if (ocrNameExtracted) {
      const nameSimilarity = fuzzyNameMatch(data.fullName, ocrNameExtracted);
      if (nameSimilarity < 0.6) {
        mismatches.push(`Name mismatch: You entered "${data.fullName}" but PAN card shows "${ocrNameExtracted}"`);
      }
    }
  } catch (err) {
    logger.error({ err }, "[Digital KYC] PAN OCR failed");
    mismatches.push("Could not process PAN card image. Please try again with a clearer photo.");
  }

  try {
    const aadhaarOcrText = await ocrImageFromUrl(data.aadhaarFrontUrl, apiKey);
    logger.info({ ocrTextLength: aadhaarOcrText.length }, "[Digital KYC] Aadhaar OCR complete");

    const aadhaarDigits = aadhaarOcrText.replace(/[^0-9]/g, "");
    const aadhaar12Match = aadhaarDigits.match(/\d{12}/);
    if (aadhaar12Match) {
      ocrAadhaarExtracted = aadhaar12Match[0].slice(-4);
    } else {
      const aadhaarSegments = aadhaarOcrText.match(/\d{4}\s*\d{4}\s*\d{4}/);
      if (aadhaarSegments) {
        const digits = aadhaarSegments[0].replace(/\s/g, "");
        ocrAadhaarExtracted = digits.slice(-4);
      }
    }

    if (!ocrAadhaarExtracted) {
      mismatches.push("Aadhaar number could not be read from the image. Please upload a clear photo.");
    } else if (ocrAadhaarExtracted !== data.aadhaarLast4) {
      mismatches.push(`Aadhaar mismatch: You entered last 4 digits as ${data.aadhaarLast4} but image shows ${ocrAadhaarExtracted}`);
    }
  } catch (err) {
    logger.error({ err }, "[Digital KYC] Aadhaar OCR failed");
    mismatches.push("Could not process Aadhaar image. Please try again with a clearer photo.");
  }

  const isVerified = mismatches.length === 0 && ocrPanExtracted !== null;
  const ocrConfidence = isVerified ? "high" : (ocrPanExtracted ? "partial" : "low");

  await ensureWallet(userId);

  const kycData = {
    userId,
    level: "full" as const,
    kycMethod: "digital",
    status: isVerified ? "verified" : "rejected",
    fullName: data.fullName,
    dob: data.dob,
    panNumber: data.panNumber.toUpperCase(),
    aadhaarLast4: data.aadhaarLast4,
    addressLine: data.addressLine,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    panImageUrl: data.panImageUrl,
    aadhaarFrontUrl: data.aadhaarFrontUrl,
    aadhaarBackUrl: data.aadhaarBackUrl,
    selfieUrl: data.selfieUrl,
    ocrPanExtracted,
    ocrNameExtracted,
    ocrAadhaarExtracted,
    ocrConfidence,
    submittedAt: new Date(),
    reviewedAt: isVerified ? new Date() : null,
    rejectReason: mismatches.length > 0 ? mismatches.join("; ") : null,
  };

  let record;
  if (existing) {
    const [updated] = await db.update(kycRecordsTable)
      .set({ ...kycData, updatedAt: new Date() })
      .where(eq(kycRecordsTable.id, existing.id))
      .returning();
    record = updated!;
  } else {
    const [created] = await db.insert(kycRecordsTable).values(kycData).returning();
    record = created;
  }

  const walletLevel = isVerified ? "verified" : "rejected";
  await db.update(walletsTable).set({ kycLevel: walletLevel, updatedAt: new Date() }).where(eq(walletsTable.userId, userId));

  logger.info({
    userId,
    isVerified,
    ocrConfidence,
    mismatchCount: mismatches.length,
  }, "[Digital KYC] Verification complete");

  res.json({
    ...serializeKyc(record),
    ocrResult: {
      panExtracted: ocrPanExtracted,
      nameExtracted: ocrNameExtracted,
      aadhaarLast4Extracted: ocrAadhaarExtracted,
      confidence: ocrConfidence,
      mismatches,
      verified: isVerified,
    },
  });
});

router.get("/admin/kyc", requireAdmin, async (req: AuthRequest, res) => {
  const statusParam = req.query.status ? String(req.query.status) : undefined;
  const qb = db.select({
    kyc: kycRecordsTable,
    user: { id: usersTable.id, name: usersTable.name, email: usersTable.email, mobile: usersTable.mobile },
  })
  .from(kycRecordsTable)
  .innerJoin(usersTable, eq(kycRecordsTable.userId, usersTable.id));
  const rows = statusParam && statusParam !== "all"
    ? await qb.where(eq(kycRecordsTable.status, statusParam)).orderBy(desc(kycRecordsTable.submittedAt)).limit(200)
    : await qb.orderBy(desc(kycRecordsTable.submittedAt)).limit(200);
  res.json({
    items: rows.map((r) => ({ ...serializeKyc(r.kyc), user: r.user })),
  });
});

router.post("/admin/kyc/:id/approve", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.id, id));
  if (!row) { res.status(404).json({ error: "KYC not found" }); return; }
  await db.update(kycRecordsTable).set({
    status: "verified", reviewedAt: new Date(), reviewedBy: req.userId, rejectReason: null, updatedAt: new Date(),
  }).where(eq(kycRecordsTable.id, id));
  await db.update(walletsTable).set({ kycLevel: "verified", updatedAt: new Date() }).where(eq(walletsTable.userId, row.userId));
  res.json({ ok: true });
});

router.post("/admin/kyc/:id/reject", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const reason = String((req.body && req.body.reason) ?? "Rejected").slice(0, 500);
  const [row] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.id, id));
  if (!row) { res.status(404).json({ error: "KYC not found" }); return; }
  await db.update(kycRecordsTable).set({
    status: "rejected", reviewedAt: new Date(), reviewedBy: req.userId, rejectReason: reason, updatedAt: new Date(),
  }).where(eq(kycRecordsTable.id, id));
  await db.update(walletsTable).set({ kycLevel: "rejected", updatedAt: new Date() }).where(eq(walletsTable.userId, row.userId));
  res.json({ ok: true });
});

function serializeKyc(r: typeof kycRecordsTable.$inferSelect) {
  return {
    id: r.id,
    userId: r.userId,
    level: r.level,
    status: r.status,
    kycMethod: r.kycMethod,
    fullName: r.fullName,
    dob: r.dob,
    panNumber: r.panNumber,
    aadhaarLast4: r.aadhaarLast4,
    addressLine: r.addressLine,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    panImageUrl: r.panImageUrl,
    aadhaarFrontUrl: r.aadhaarFrontUrl,
    aadhaarBackUrl: r.aadhaarBackUrl,
    selfieUrl: r.selfieUrl,
    ocrPanExtracted: r.ocrPanExtracted,
    ocrNameExtracted: r.ocrNameExtracted,
    ocrAadhaarExtracted: r.ocrAadhaarExtracted,
    ocrConfidence: r.ocrConfidence,
    submittedAt: r.submittedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    rejectReason: r.rejectReason,
  };
}

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_HOSTS = ["storage.googleapis.com"];
const FETCH_TIMEOUT_MS = 15_000;

function isAllowedImageUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

async function ocrImageFromUrl(imageUrl: string, apiKey: string): Promise<string> {
  if (!isAllowedImageUrl(imageUrl)) {
    throw new Error("Image URL not from allowed storage domain");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const imgResp = await fetch(imageUrl, { signal: controller.signal });
    if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);

    const contentLength = imgResp.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
      throw new Error("Image too large for OCR processing");
    }

    const buffer = Buffer.from(await imgResp.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error("Image too large for OCR processing");
    }

    const base64 = buffer.toString("base64");

    const visionResp = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          imageContext: { languageHints: ["en", "hi"] },
        }],
      }),
    });

    if (!visionResp.ok) {
      const text = await visionResp.text();
      logger.error({ status: visionResp.status, bodySnippet: text.slice(0, 200) }, "[Digital KYC] Vision API failed");
      throw new Error(`Vision API error: ${visionResp.status}`);
    }

    const json = (await visionResp.json()) as any;
    const r0 = json?.responses?.[0] ?? {};
    if (r0.error) throw new Error(r0.error.message || "Vision API error");
    return r0.fullTextAnnotation?.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function extractNameFromPanOcr(ocrText: string, panNumber: string): string | null {
  const lines = ocrText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const panLineIdx = lines.findIndex((l: string) => l.includes(panNumber));

  const namePatterns = [/^[A-Z][A-Z\s]+$/];
  const skipPatterns = [
    /INCOME\s*TAX/i, /GOVERNMENT/i, /INDIA/i, /PERMANENT/i, /ACCOUNT/i,
    /NUMBER/i, /CARD/i, /DEPT/i, /SIGNATURE/i, /\d{2}\/\d{2}\/\d{4}/,
    /FATHER/i, /DOB/i, /DATE/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === panNumber) continue;
    if (skipPatterns.some((p) => p.test(line))) continue;
    if (line.length < 3 || line.length > 100) continue;
    if (/^\d+$/.test(line)) continue;

    if (namePatterns.some((p) => p.test(line)) && line.split(/\s+/).length >= 2) {
      return line;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === panNumber) continue;
    if (skipPatterns.some((p) => p.test(line))) continue;
    if (/^[A-Za-z\s]{3,80}$/.test(line) && line.split(/\s+/).length >= 2) {
      return line.toUpperCase();
    }
  }

  return null;
}

function fuzzyNameMatch(entered: string, extracted: string): number {
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, " ").replace(/\s+/g, " ").trim();
  const a = normalize(entered);
  const b = normalize(extracted);
  if (a === b) return 1.0;

  const wordsA = a.split(" ").filter((w) => w.length > 0);
  const wordsB = b.split(" ").filter((w) => w.length > 0);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let matches = 0;
  for (const wa of wordsA) {
    if (wordsB.some((wb) => wb === wa || wb.includes(wa) || wa.includes(wb))) {
      matches++;
    }
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}

export default router;

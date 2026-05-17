import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, usersTable as users } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { sendServiceRequestEmail } from "../lib/mailer";

const router = Router();

const SUPPORTED_SERVICES = [
  "Insurance Payment",
  "Money Transfer",
  "Sender Registration",
  "Add Beneficiary",
  "Verify Beneficiary",
  "Search Beneficiary",
  "NSDL PAN Card",
  "NSDL New PAN",
  "NSDL PAN Correction",
  "Postpaid Bill",
  "Electricity Bill",
  "Gas Bill",
] as const;

const Body = z.object({
  service: z.enum(SUPPORTED_SERVICES),
  fields: z.record(z.string(), z.string().max(500)),
});

router.post("/service-request", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  const userId = req.userId!;
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) { res.status(404).json({ error: "User not found" }); return; }

  // Best-effort email — never block the user on SMTP failure.
  try {
    await sendServiceRequestEmail({
      service: parsed.data.service,
      user: { id: u.id, name: u.name ?? u.email, email: u.email },
      fields: parsed.data.fields,
    });
  } catch (err) {
    req.log?.warn({ err }, "service-request email failed");
  }

  res.json({
    status: "submitted",
    message: "Request received. Our team will contact you within 24 hours.",
  });
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { setTpin, changeTpin, hasTpin, isValidPinFormat } from "../lib/tpin";

const router = Router();

router.get("/tpin/status", requireAuth, async (req: AuthRequest, res) => {
  const set = await hasTpin(req.userId!);
  res.json({ tpinSet: set });
});

const setBody = z.object({ pin: z.string().regex(/^[0-9]{4,6}$/) });
router.post("/tpin/set", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = setBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "T-PIN must be 4-6 digits" }); return; }
  const already = await hasTpin(req.userId!);
  if (already) { res.status(409).json({ error: "T-PIN already set. Use change endpoint." }); return; }
  await setTpin(req.userId!, parsed.data.pin);
  res.json({ ok: true });
});

const changeBody = z.object({ oldPin: z.string(), newPin: z.string().regex(/^[0-9]{4,6}$/) });
router.post("/tpin/change", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = changeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid pins" }); return; }
  try {
    await changeTpin(req.userId!, parsed.data.oldPin, parsed.data.newPin);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Failed" });
  }
});

export default router;
void isValidPinFormat;

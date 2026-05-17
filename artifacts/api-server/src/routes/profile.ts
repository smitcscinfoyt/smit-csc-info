import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = Router();

const UpdateProfileBody = z.object({
  name: z.string().min(2).max(100).optional(),
  mobile: z
    .string()
    .regex(/^\d{10}$/, "Mobile must be exactly 10 digits")
    .optional(),
  email: z.string().email("Invalid email address").optional(),
  profilePhoto: z
    .string()
    .max(500000, "Image too large (max ~375KB)")
    .nullable()
    .optional(),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

router.patch("/profile", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { name, mobile, email, profilePhoto } = parsed.data;

  if (email) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (existing && existing.id !== userId) {
      res.status(409).json({ error: "Email is already in use by another account" });
      return;
    }
  }

  const updates: Record<string, string | null | undefined> = {};
  if (name !== undefined) updates.name = name;
  if (mobile !== undefined) updates.mobile = mobile;
  if (email !== undefined) updates.email = email;
  if (profilePhoto !== undefined) updates.profilePhoto = profilePhoto;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    profilePhoto: user.profilePhoto ?? null,
    createdAt: user.createdAt.toISOString(),
  });
});

router.post("/profile/password", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;

  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.passwordHash) {
    res.status(400).json({ error: "Password change not available for social login accounts" });
    return;
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, userId));

  res.json({ success: true, message: "Password updated successfully" });
});

router.get("/profile", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    profilePhoto: user.profilePhoto ?? null,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;

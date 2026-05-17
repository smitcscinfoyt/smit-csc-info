import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

/**
 * Tiny per-process cache so requireAuth doesn't hit the DB on
 * every authenticated request just to check `isDeleted`. The cache
 * is keyed by userId; entries expire after 60s, so a soft-delete
 * propagates within at most a minute on every API surface (wallet,
 * recharge, money, kyc, profile, etc.). Login + /auth/me bypass
 * this cache and check the DB directly.
 */
const DELETED_CHECK_TTL_MS = 60_000;
const userActiveCache = new Map<number, { isDeleted: boolean; expiresAt: number }>();

async function isUserDeleted(userId: number): Promise<boolean> {
  const now = Date.now();
  const cached = userActiveCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.isDeleted;
  const [row] = await db
    .select({ isDeleted: usersTable.isDeleted })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  // If row missing entirely, treat as deleted (kicks the token out).
  const isDeleted = !row || row.isDeleted === true;
  userActiveCache.set(userId, { isDeleted, expiresAt: now + DELETED_CHECK_TTL_MS });
  return isDeleted;
}

/** Invalidate the cache for a specific user — call this from
 *  routes that delete or restore a user so the change takes
 *  effect immediately on the next request, not after the TTL. */
export function invalidateUserActiveCache(userId: number): void {
  userActiveCache.delete(userId);
}

export function signToken(payload: { userId: number; role: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: "8h" });
}

export function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    return jwt.verify(token, SECRET) as { userId: number; role: string };
  } catch {
    return null;
  }
}

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  // Block soft-deleted accounts on every authenticated surface
  // (wallet, recharge, money, kyc, profile, etc.). Cached for 60s
  // to keep the per-request overhead negligible.
  isUserDeleted(payload.userId)
    .then((deleted) => {
      if (deleted) {
        res.status(401).json({ error: "Account deactivated", code: "account_deleted" });
        return;
      }
      req.userId = payload.userId;
      req.userRole = payload.role;
      next();
    })
    .catch(next);
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      req.userId = payload.userId;
      req.userRole = payload.role;
    }
  }
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.userRole !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export function requireAdminOrManager(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.userRole !== "admin" && req.userRole !== "manager") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

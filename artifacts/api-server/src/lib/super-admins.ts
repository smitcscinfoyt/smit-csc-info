import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Response, NextFunction } from "express";
import { requireAuth, type AuthRequest } from "./auth";

/**
 * Hard-coded super-admin allowlist.
 *
 * Super-admins have permissions that even regular admins do not — most
 * importantly, deleting any user account (admin / manager / user). The
 * list is checked against the email stored on the user row (lower-cased
 * comparison) at request time, so promoting/demoting via the role API
 * cannot grant or revoke super-admin powers.
 */
export const SUPER_ADMIN_EMAILS: readonly string[] = [
  "sagarkindarkhediya6@gmail.com",
  "smitcscinfoyt@gmail.com",
];

const SUPER_ADMIN_SET = new Set(
  SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()),
);

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_SET.has(email.trim().toLowerCase());
}

/** Fetch a user's email from the DB by id (used by super-admin checks
 *  that need to verify *target* identity — e.g. "is this user I'm
 *  trying to delete a super-admin?"). Returns null if not found. */
export async function getUserEmail(id: number): Promise<string | null> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return u?.email ?? null;
}

/** Express middleware: requires the caller to be authenticated AND on
 *  the super-admin allowlist. JWT only carries userId+role, so we look
 *  up the email from the DB on every call. */
export function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  requireAuth(req, res, () => {
    // Wrap the async lookup so any DB failure surfaces as a clean
    // 5xx via Express's error pipeline instead of an unhandled
    // promise rejection.
    (async () => {
      if (!req.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const email = await getUserEmail(req.userId);
      if (!isSuperAdminEmail(email)) {
        res.status(403).json({ error: "Super-admin access required" });
        return;
      }
      next();
    })().catch(next);
  });
}

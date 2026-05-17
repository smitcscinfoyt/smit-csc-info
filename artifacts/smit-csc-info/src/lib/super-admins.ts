/**
 * Client-side mirror of the server super-admin allowlist
 * (`artifacts/api-server/src/lib/super-admins.ts`). Used purely for
 * UI gating — to decide whether to show the Delete User action. The
 * backend still enforces the same list on every privileged request,
 * so spoofing the client list cannot grant any actual permission.
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

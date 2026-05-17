import { db, paymentsTable, paymentRemindersTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, isNotNull, desc } from "drizzle-orm";
import { logger } from "./logger";
import { sendPrimeReminderEmail } from "./mailer";
import { buildPrimeEmail, type PrimeEmailKind } from "./prime-emails";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:8080";
}

/**
 * Returns the reminder window for a payment based on its expiry date relative to "now".
 * Each window is a 24-hour bucket so that emails are sent only once per stage.
 */
function pickReminderKind(expiry: Date, now: Date): PrimeEmailKind | null {
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / DAY;

  // Before-expiry windows (positive = future)
  if (diffDays <= 7 && diffDays > 6) return "before_7d";
  if (diffDays <= 3 && diffDays > 2) return "before_3d";
  if (diffDays <= 1 && diffDays > 0) return "before_1d";

  // After-expiry windows (negative diff)
  const sinceExpiryDays = -diffDays;
  if (sinceExpiryDays >= 0 && sinceExpiryDays < 1) return "expired_today";
  if (sinceExpiryDays >= 3 && sinceExpiryDays < 4) return "expired_3d";
  if (sinceExpiryDays >= 7 && sinceExpiryDays < 8) return "expired_7d";
  return null;
}

/**
 * Atomically claim a (paymentId, kind) reminder slot. Returns the inserted row
 * id on success, or null if another worker has already claimed/sent this slot.
 * The unique index on (payment_id, reminder_type) makes this race-safe.
 */
async function tryClaim(paymentId: number, kind: PrimeEmailKind): Promise<number | null> {
  try {
    const [row] = await db
      .insert(paymentRemindersTable)
      .values({ paymentId, reminderType: kind })
      .returning({ id: paymentRemindersTable.id });
    return row?.id ?? null;
  } catch {
    // Unique-constraint conflict — already claimed.
    return null;
  }
}

async function releaseClaim(claimId: number): Promise<void> {
  try {
    await db.delete(paymentRemindersTable).where(eq(paymentRemindersTable.id, claimId));
  } catch (err) {
    logger.warn({ err, claimId }, "[REMINDERS] release claim failed");
  }
}

/**
 * Returns the user's MOST RECENT successful payment by creation order.
 * A newer payment always supersedes older ones, even if its expiry is shorter.
 */
async function getLatestSuccessfulPayment(userId: number) {
  const [row] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "success")))
    .orderBy(desc(paymentsTable.createdAt), desc(paymentsTable.id))
    .limit(1);
  return row ?? null;
}

export async function runPrimeReminderSweep(): Promise<{
  scanned: number;
  sent: number;
  errors: number;
}> {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - 10 * DAY); // anything expired up to 10 days ago
  const lookforwardEnd = new Date(now.getTime() + 8 * DAY); // anything expiring in next 8 days

  // Find every successful payment whose expiry sits inside the reminder horizon.
  const candidates = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, "success"),
        isNotNull(paymentsTable.expiryDate),
        gte(paymentsTable.expiryDate, lookbackStart),
        lte(paymentsTable.expiryDate, lookforwardEnd),
      ),
    );

  let sent = 0;
  let errors = 0;

  for (const payment of candidates) {
    if (!payment.expiryDate) continue;
    const expiry = new Date(payment.expiryDate);
    const kind = pickReminderKind(expiry, now);
    if (!kind) continue;

    // Skip if user has a newer successful payment (this one is superseded).
    const latest = await getLatestSuccessfulPayment(payment.userId);
    if (!latest || latest.id !== payment.id) continue;

    // Atomically claim this (paymentId, kind) slot. If another worker (or a
    // previous sweep) has already claimed/sent it, this returns null and we skip.
    const claimId = await tryClaim(payment.id, kind);
    if (claimId === null) continue;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId)).limit(1);
    if (!user || !user.email) {
      // Keep the claim row so we don't retry broken records every hour.
      logger.warn({ paymentId: payment.id, kind }, "[REMINDERS] no user/email — claim retained");
      continue;
    }

    const renewUrl = `${getAppUrl()}/membership`;
    const { subject, html } = buildPrimeEmail(kind, user.name ?? "", payment.plan, expiry, renewUrl);

    try {
      await sendPrimeReminderEmail(user.email, subject, html);
      sent++;
      logger.info({ userId: user.id, paymentId: payment.id, kind }, "[REMINDERS] sent");
    } catch (err) {
      // Send failed — release the claim so we retry on the next sweep.
      await releaseClaim(claimId);
      errors++;
      logger.error({ err, userId: user.id, paymentId: payment.id, kind }, "[REMINDERS] send failed (claim released for retry)");
    }
  }

  return { scanned: candidates.length, sent, errors };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startPrimeReminderScheduler(): void {
  if (intervalHandle) return;
  const tick = async () => {
    try {
      const result = await runPrimeReminderSweep();
      if (result.scanned > 0 || result.sent > 0) {
        logger.info(result, "[REMINDERS] sweep complete");
      }
    } catch (err) {
      logger.error({ err }, "[REMINDERS] sweep crashed");
    }
  };
  // Run shortly after boot, then every hour.
  setTimeout(tick, 30_000);
  intervalHandle = setInterval(tick, HOUR);
  logger.info("[REMINDERS] scheduler started — runs hourly");
}

export function stopPrimeReminderScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

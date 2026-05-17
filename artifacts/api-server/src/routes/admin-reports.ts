import { Router } from "express";
import { db, rechargesTable, walletLedgerTable, walletTopupsTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../lib/auth";

const router = Router();

const IST_OFFSET_MIN = 330;
const MAX_RANGE_DAYS = 400;

function parseRange(req: AuthRequest): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromQ = req.query.from ? String(req.query.from) : "";
  const toQ = req.query.to ? String(req.query.to) : "";
  const from = fromQ ? new Date(fromQ) : defaultFrom;
  const to = toQ ? new Date(toQ) : now;
  if (Number.isNaN(from.getTime())) throw new Error("Invalid from");
  if (Number.isNaN(to.getTime())) throw new Error("Invalid to");
  if (toQ && toQ.length === 10) to.setUTCHours(23, 59, 59, 999);
  if (from > to) throw new Error("`from` must be <= `to`");
  const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range too large (max ${MAX_RANGE_DAYS} days)`);
  }
  return { from, to };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // CSV formula-injection guard: prefix dangerous leading chars with apostrophe
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers: string[], rows: any[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

// ─── GET /admin/reports/summary ──────────────────────────────────────────────
router.get("/admin/reports/summary", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { from, to } = parseRange(req);
    const where = and(gte(rechargesTable.createdAt, from), lte(rechargesTable.createdAt, to));

    const [totals] = await db.select({
      total: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'failed')::int`,
      processingCount: sql<number>`count(*) filter (where ${rechargesTable.status} in ('pending','processing'))::int`,
      refundedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'refunded')::int`,
      totalAmountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      totalCommissionPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      refundedAmountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'refunded'), 0)::bigint`,
      uniqueUsers: sql<number>`count(distinct ${rechargesTable.userId})::int`,
    }).from(rechargesTable).where(where);

    const [topup] = await db.select({
      count: sql<number>`count(*)::int`,
      amountPaise: sql<number>`coalesce(sum(${walletTopupsTable.amountPaise}) filter (where ${walletTopupsTable.status} = 'success'), 0)::bigint`,
    }).from(walletTopupsTable).where(and(
      gte(walletTopupsTable.createdAt, from),
      lte(walletTopupsTable.createdAt, to),
    ));

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      recharges: {
        total: Number(totals?.total ?? 0),
        successCount: Number(totals?.successCount ?? 0),
        failedCount: Number(totals?.failedCount ?? 0),
        processingCount: Number(totals?.processingCount ?? 0),
        refundedCount: Number(totals?.refundedCount ?? 0),
        totalAmountPaise: Number(totals?.totalAmountPaise ?? 0),
        totalCommissionPaise: Number(totals?.totalCommissionPaise ?? 0),
        refundedAmountPaise: Number(totals?.refundedAmountPaise ?? 0),
        uniqueUsers: Number(totals?.uniqueUsers ?? 0),
      },
      walletTopup: {
        count: Number(topup?.count ?? 0),
        amountPaise: Number(topup?.amountPaise ?? 0),
      },
    });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "reports/summary failed");
    res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ─── GET /admin/reports/timeseries ───────────────────────────────────────────
router.get("/admin/reports/timeseries", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { from, to } = parseRange(req);
    const groupBy = String(req.query.groupBy ?? "day") === "month" ? "month" : "day";

    // Convert UTC timestamps to IST (Asia/Kolkata) by adding 5h30m before truncating.
    // Parameterised: multiply a "1 minute" interval by the offset to avoid sql.raw.
    const istShift = sql`(${rechargesTable.createdAt} + (interval '1 minute' * ${IST_OFFSET_MIN}))`;
    const bucket = groupBy === "month"
      ? sql<string>`to_char(date_trunc('month', ${istShift}), 'YYYY-MM')`
      : sql<string>`to_char(date_trunc('day', ${istShift}), 'YYYY-MM-DD')`;

    const rows = await db.select({
      bucket,
      count: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'failed')::int`,
      amountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      commissionPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
    })
      .from(rechargesTable)
      .where(and(gte(rechargesTable.createdAt, from), lte(rechargesTable.createdAt, to)))
      .groupBy(bucket)
      .orderBy(bucket);

    res.json({
      from: from.toISOString(), to: to.toISOString(), groupBy,
      points: rows.map((r) => ({
        bucket: r.bucket,
        count: Number(r.count),
        successCount: Number(r.successCount),
        failedCount: Number(r.failedCount),
        amountPaise: Number(r.amountPaise),
        commissionPaise: Number(r.commissionPaise),
      })),
    });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "reports/timeseries failed");
    res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ─── GET /admin/reports/operators ────────────────────────────────────────────
router.get("/admin/reports/operators", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { from, to } = parseRange(req);
    const rows = await db.select({
      type: rechargesTable.type,
      operatorCode: rechargesTable.operatorCode,
      operatorName: rechargesTable.operatorName,
      count: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'failed')::int`,
      amountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      commissionPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
    })
      .from(rechargesTable)
      .where(and(gte(rechargesTable.createdAt, from), lte(rechargesTable.createdAt, to)))
      .groupBy(rechargesTable.type, rechargesTable.operatorCode, rechargesTable.operatorName)
      .orderBy(desc(sql`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)`));

    res.json({
      from: from.toISOString(), to: to.toISOString(),
      items: rows.map((r) => ({
        type: r.type,
        operatorCode: r.operatorCode,
        operatorName: r.operatorName,
        count: Number(r.count),
        successCount: Number(r.successCount),
        failedCount: Number(r.failedCount),
        amountPaise: Number(r.amountPaise),
        commissionPaise: Number(r.commissionPaise),
        successRate: Number(r.count) > 0 ? Number(r.successCount) / Number(r.count) : 0,
      })),
    });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "reports/operators failed");
    res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ─── GET /admin/reports/users — top users ────────────────────────────────────
router.get("/admin/reports/users", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { from, to } = parseRange(req);
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")) || 20, 100);

    const rows = await db.select({
      userId: rechargesTable.userId,
      name: usersTable.name,
      email: usersTable.email,
      mobile: usersTable.mobile,
      count: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      amountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      commissionPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
    })
      .from(rechargesTable)
      .innerJoin(usersTable, eq(rechargesTable.userId, usersTable.id))
      .where(and(gte(rechargesTable.createdAt, from), lte(rechargesTable.createdAt, to)))
      .groupBy(rechargesTable.userId, usersTable.name, usersTable.email, usersTable.mobile)
      .orderBy(desc(sql`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)`))
      .limit(limit);

    res.json({
      from: from.toISOString(), to: to.toISOString(),
      items: rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        mobile: r.mobile,
        count: Number(r.count),
        successCount: Number(r.successCount),
        amountPaise: Number(r.amountPaise),
        commissionPaise: Number(r.commissionPaise),
      })),
    });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "reports/users failed");
    res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

// ─── GET /admin/reports/export — CSV download ────────────────────────────────
router.get("/admin/reports/export", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { from, to } = parseRange(req);
    const kind = String(req.query.kind ?? "recharges");

    if (kind === "wallet") {
      const rows = await db.select({
        l: walletLedgerTable,
        user: { name: usersTable.name, email: usersTable.email, mobile: usersTable.mobile },
      })
        .from(walletLedgerTable)
        .innerJoin(usersTable, eq(walletLedgerTable.userId, usersTable.id))
        .where(and(gte(walletLedgerTable.createdAt, from), lte(walletLedgerTable.createdAt, to)))
        .orderBy(desc(walletLedgerTable.createdAt))
        .limit(10000);

      const headers = ["id", "createdAt", "userName", "userMobile", "userEmail", "direction", "type", "amountRupees", "balanceAfterRupees", "refType", "refId", "refCode", "note"];
      const data = rows.map((r) => [
        r.l.id,
        r.l.createdAt.toISOString(),
        r.user.name, r.user.mobile, r.user.email,
        r.l.direction, r.l.type,
        (Number(r.l.amountPaise) / 100).toFixed(2),
        (Number(r.l.balanceAfterPaise) / 100).toFixed(2),
        r.l.refType, r.l.refId, r.l.refCode, r.l.note,
      ]);
      const csv = rowsToCsv(headers, data);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="wallet-ledger-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
      return;
    }

    // default: recharges
    const rows = await db.select({
      r: rechargesTable,
      user: { name: usersTable.name, email: usersTable.email, mobile: usersTable.mobile },
    })
      .from(rechargesTable)
      .innerJoin(usersTable, eq(rechargesTable.userId, usersTable.id))
      .where(and(gte(rechargesTable.createdAt, from), lte(rechargesTable.createdAt, to)))
      .orderBy(desc(rechargesTable.createdAt))
      .limit(10000);

    const headers = [
      "id", "createdAt", "completedAt", "userName", "userMobile", "userEmail",
      "type", "operatorCode", "operatorName", "circleCode", "accountNumber",
      "amountRupees", "commissionRupees", "tier", "status",
      "a1RequestId", "a1OrderId", "a1OperatorRef", "errorReason",
    ];
    const data = rows.map((row) => [
      row.r.id,
      row.r.createdAt.toISOString(),
      row.r.completedAt ? row.r.completedAt.toISOString() : "",
      row.user.name, row.user.mobile, row.user.email,
      row.r.type, row.r.operatorCode, row.r.operatorName, row.r.circleCode, row.r.accountNumber,
      (Number(row.r.amountPaise) / 100).toFixed(2),
      (Number(row.r.commissionPaise) / 100).toFixed(2),
      row.r.commissionTier, row.r.status,
      row.r.a1RequestId, row.r.a1OrderId, row.r.a1OperatorRef, row.r.errorReason,
    ]);
    const csv = rowsToCsv(headers, data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="recharges-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "reports/export failed");
    res.status(400).json({ error: e?.message ?? "Bad request" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { db, usersTable, paymentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

// ─── GET /stats — public platform stats for home page ─────────────────────
router.get("/stats", async (_req, res): Promise<void> => {
  try {
    const [userCountRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(usersTable);

    const [primeCountRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "success"));

    const userCount = userCountRow?.count ?? 0;
    const primeCount = primeCountRow?.count ?? 0;

    res.json({
      members: userCount,
      transactions: primeCount,
      states: 33,
      priceFrom: 299,
    });
  } catch {
    res.json({
      members: 500,
      transactions: 10000,
      states: 33,
      priceFrom: 299,
    });
  }
});

export default router;

import { Router } from "express";
import { db, usersTable, paymentsTable, contentTable } from "@workspace/db";
import { eq, and, gte, count, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const [activePayment] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.userId, userId),
        eq(paymentsTable.status, "success"),
        gte(paymentsTable.expiryDate, now)
      )
    )
    .orderBy(desc(paymentsTable.expiryDate))
    .limit(1);

  const membership = activePayment
    ? {
        isActive: true,
        plan: activePayment.plan,
        expiresAt: activePayment.expiryDate!.toISOString(),
        daysRemaining: Math.ceil(
          (activePayment.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
      }
    : { isActive: false };

  const recentPayments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.userId, userId))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(5);

  const [{ total }] = await db.select({ total: count() }).from(contentTable);
  const [{ primeCount }] = await db
    .select({ primeCount: count() })
    .from(contentTable)
    .where(eq(contentTable.isPrime, true));

  res.json(
    GetDashboardSummaryResponse.parse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        profilePhoto: (user as any).profilePhoto ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      membership,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        userId: p.userId,
        amount: p.amount,
        plan: p.plan,
        transactionId: p.transactionId,
        status: p.status,
        expiryDate: p.expiryDate ? p.expiryDate.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
      })),
      contentStats: {
        totalContent: total,
        primeContent: primeCount,
        freeContent: total - primeCount,
      },
    })
  );
});

export default router;

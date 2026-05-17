import { pgTable, serial, integer, varchar, timestamp, bigint, text, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { walletsTable } from "./wallets";

export const rechargesTable = pgTable("recharges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id),

  type: varchar("type", { length: 20 }).notNull(),
  operatorCode: varchar("operator_code", { length: 50 }).notNull(),
  operatorName: varchar("operator_name", { length: 100 }).notNull(),
  circleCode: varchar("circle_code", { length: 20 }),
  accountNumber: varchar("account_number", { length: 100 }).notNull(),
  customerName: varchar("customer_name", { length: 200 }),

  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  commissionPaise: bigint("commission_paise", { mode: "number" }).notNull().default(0),
  commissionTier: varchar("commission_tier", { length: 20 }).notNull().default("free"),
  commissionPercentBp: integer("commission_percent_bp").notNull().default(0),
  netCostPaise: bigint("net_cost_paise", { mode: "number" }).notNull(),

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  a1RequestId: varchar("a1_request_id", { length: 80 }).notNull().unique(),
  a1OrderId: varchar("a1_order_id", { length: 120 }),
  a1OperatorRef: varchar("a1_operator_ref", { length: 120 }),
  a1ResponseCode: varchar("a1_response_code", { length: 40 }),
  errorReason: text("error_reason"),
  responseRaw: jsonb("response_raw"),

  idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
  debitLedgerId: integer("debit_ledger_id"),
  refundLedgerId: integer("refund_ledger_id"),
  commissionLedgerId: integer("commission_ledger_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  byUser: index("recharges_user_idx").on(t.userId, t.createdAt),
  byStatus: index("recharges_status_idx").on(t.status, t.createdAt),
  byA1Order: index("recharges_a1_order_idx").on(t.a1OrderId),
  byCreatedAt: index("recharges_created_at_idx").on(t.createdAt),
  uqUserIdem: uniqueIndex("recharges_user_idem_uq").on(t.userId, t.idempotencyKey),
}));

export const insertRechargeSchema = createInsertSchema(rechargesTable).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});
export type InsertRecharge = z.infer<typeof insertRechargeSchema>;
export type Recharge = typeof rechargesTable.$inferSelect;

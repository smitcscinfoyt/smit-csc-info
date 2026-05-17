import { pgTable, serial, integer, varchar, timestamp, bigint, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const walletTopupsTable = pgTable("wallet_topups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull().unique(),
  phonePeOrderId: varchar("phonepe_order_id", { length: 255 }),
  phonePeProviderRef: varchar("phonepe_provider_ref", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorReason: text("error_reason"),
  ledgerEntryId: integer("ledger_entry_id"),
  // Manual top-up fields (used when method != 'phonepe')
  method: varchar("method", { length: 20 }).notNull().default("phonepe"),
  channel: varchar("channel", { length: 20 }),
  utr: varchar("utr", { length: 64 }),
  proofUrl: text("proof_url"),
  userNote: text("user_note"),
  adminNote: text("admin_note"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  byUser: index("wallet_topups_user_idx").on(t.userId, t.createdAt),
  byStatus: index("wallet_topups_status_idx").on(t.status),
  byMethod: index("wallet_topups_method_idx").on(t.method, t.status),
}));

export const insertWalletTopupSchema = createInsertSchema(walletTopupsTable).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});
export type InsertWalletTopup = z.infer<typeof insertWalletTopupSchema>;
export type WalletTopup = typeof walletTopupsTable.$inferSelect;

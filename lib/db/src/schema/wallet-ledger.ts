import { pgTable, serial, integer, varchar, timestamp, bigint, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { walletsTable } from "./wallets";

export const walletLedgerTable = pgTable("wallet_ledger", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => walletsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  direction: varchar("direction", { length: 10 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  balanceAfterPaise: bigint("balance_after_paise", { mode: "number" }).notNull(),
  refType: varchar("ref_type", { length: 30 }),
  refId: integer("ref_id"),
  refCode: varchar("ref_code", { length: 80 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("wallet_ledger_user_idx").on(t.userId, t.createdAt),
  byWallet: index("wallet_ledger_wallet_idx").on(t.walletId, t.createdAt),
  byCreatedAt: index("wallet_ledger_created_at_idx").on(t.createdAt),
  byRef: index("wallet_ledger_ref_idx").on(t.refType, t.refId),
}));

export const insertWalletLedgerSchema = createInsertSchema(walletLedgerTable).omit({
  id: true, createdAt: true,
});
export type InsertWalletLedger = z.infer<typeof insertWalletLedgerSchema>;
export type WalletLedgerEntry = typeof walletLedgerTable.$inferSelect;

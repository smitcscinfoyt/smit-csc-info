import { pgTable, serial, integer, varchar, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  balancePaise: bigint("balance_paise", { mode: "number" }).notNull().default(0),
  kycLevel: varchar("kyc_level", { length: 20 }).notNull().default("none"),
  tpinHash: varchar("tpin_hash", { length: 255 }),
  tpinRequiredFromPaise: bigint("tpin_required_from_paise", { mode: "number" }).notNull().default(50000),
  isFrozen: integer("is_frozen").notNull().default(0),
  freezeReason: varchar("freeze_reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;

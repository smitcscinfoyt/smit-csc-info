import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userCreditsTable = pgTable(
  "user_credits",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    credits: integer("credits").notNull().default(0),
    monthlyAllowance: integer("monthly_allowance").notNull().default(10),
    cycleStart: timestamp("cycle_start").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: uniqueIndex("user_credits_user_idx").on(t.userId),
  }),
);

export const creditTransactionsTable = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: varchar("reason", { length: 80 }).notNull(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserCreditsSchema = createInsertSchema(userCreditsTable).omit({
  id: true,
  updatedAt: true,
});
export type UserCredits = typeof userCreditsTable.$inferSelect;
export type CreditTransaction = typeof creditTransactionsTable.$inferSelect;
export const userCreditsZ: z.ZodType<UserCredits> = z.any();

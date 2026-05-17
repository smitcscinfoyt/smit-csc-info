import { pgTable, serial, integer, varchar, timestamp, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionSlabsTable = pgTable("commission_slabs", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  operatorCode: varchar("operator_code", { length: 50 }).notNull().default("*"),
  tier: varchar("tier", { length: 20 }).notNull(),
  percentBp: integer("percent_bp").notNull(),
  minAmountPaise: bigint("min_amount_paise", { mode: "number" }).notNull().default(1000),
  maxAmountPaise: bigint("max_amount_paise", { mode: "number" }).notNull().default(500000),
  isActive: integer("is_active").notNull().default(1),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byLookup: index("commission_slabs_lookup_idx").on(t.type, t.operatorCode, t.tier),
}));

export const insertCommissionSlabSchema = createInsertSchema(commissionSlabsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCommissionSlab = z.infer<typeof insertCommissionSlabSchema>;
export type CommissionSlab = typeof commissionSlabsTable.$inferSelect;

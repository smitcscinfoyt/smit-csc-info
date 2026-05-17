import { pgTable, serial, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rechargeSettingsTable = pgTable("recharge_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  value: jsonb("value").notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRechargeSettingSchema = createInsertSchema(rechargeSettingsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertRechargeSetting = z.infer<typeof insertRechargeSettingSchema>;
export type RechargeSetting = typeof rechargeSettingsTable.$inferSelect;

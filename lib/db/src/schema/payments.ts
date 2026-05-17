import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: integer("amount").notNull(),
  plan: varchar("plan", { length: 50 }).notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  expiryDate: timestamp("expiry_date"),
  // Billing details collected at checkout
  billingName: text("billing_name"),
  billingMobile: varchar("billing_mobile", { length: 20 }),
  billingEmail: varchar("billing_email", { length: 255 }),
  billingState: varchar("billing_state", { length: 80 }),
  billingDistrict: varchar("billing_district", { length: 80 }),
  // Coupon
  couponCode: varchar("coupon_code", { length: 40 }),
  discountPaise: integer("discount_paise").notNull().default(0),
  originalAmountPaise: integer("original_amount_paise"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;

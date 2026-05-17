import { pgTable, serial, integer, varchar, timestamp, bigint, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const operatorMembershipPaymentsTable = pgTable("operator_membership_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  plan: varchar("plan", { length: 20 }).notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull().unique(),
  phonePeOrderId: varchar("phonepe_order_id", { length: 255 }),
  phonePeProviderRef: varchar("phonepe_provider_ref", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorReason: text("error_reason"),
  // Billing details collected at checkout
  billingName: text("billing_name"),
  billingMobile: varchar("billing_mobile", { length: 20 }),
  billingEmail: varchar("billing_email", { length: 255 }),
  billingState: varchar("billing_state", { length: 80 }),
  billingDistrict: varchar("billing_district", { length: 80 }),
  // Coupon
  couponCode: varchar("coupon_code", { length: 40 }),
  discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
  originalAmountPaise: bigint("original_amount_paise", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  byUser: index("operator_membership_user_idx").on(t.userId, t.createdAt),
  byStatus: index("operator_membership_status_idx").on(t.status),
}));

export const insertOperatorMembershipPaymentSchema = createInsertSchema(operatorMembershipPaymentsTable).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});
export type InsertOperatorMembershipPayment = z.infer<typeof insertOperatorMembershipPaymentSchema>;
export type OperatorMembershipPayment = typeof operatorMembershipPaymentsTable.$inferSelect;

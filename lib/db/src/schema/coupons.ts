import { pgTable, serial, integer, varchar, timestamp, text, boolean, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  description: text("description"),
  discountType: varchar("discount_type", { length: 10 }).notNull(),
  discountValue: integer("discount_value").notNull(),
  applicablePlans: text("applicable_plans").notNull().default(""),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  perUserLimit: integer("per_user_limit").notNull().default(1),
  minOrderPaise: bigint("min_order_paise", { mode: "number" }).notNull().default(0),
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validUntil: timestamp("valid_until").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniqCode: uniqueIndex("coupons_code_uniq").on(t.code),
  byActive: index("coupons_active_idx").on(t.isActive, t.validUntil),
}));

export type Coupon = typeof couponsTable.$inferSelect;

export const couponRedemptionsTable = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  planId: varchar("plan_id", { length: 40 }).notNull(),
  scope: varchar("scope", { length: 20 }).notNull(),
  transactionId: varchar("transaction_id", { length: 255 }).notNull(),
  discountPaise: bigint("discount_paise", { mode: "number" }).notNull(),
  finalAmountPaise: bigint("final_amount_paise", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("coupon_red_user_idx").on(t.userId, t.createdAt),
  byCoupon: index("coupon_red_coupon_idx").on(t.couponId),
  uniqTxn: uniqueIndex("coupon_red_txn_uniq").on(t.transactionId),
}));

export type CouponRedemption = typeof couponRedemptionsTable.$inferSelect;

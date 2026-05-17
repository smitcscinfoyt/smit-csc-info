import { pgTable, serial, varchar, text, timestamp, integer, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inquiriesTable = pgTable(
  "inquiries",
  {
    id: serial("id").primaryKey(),
    userName: varchar("user_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 200 }).notNull(),
    mobile: varchar("mobile", { length: 30 }),
    category: varchar("category", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    transactionId: varchar("transaction_id", { length: 80 }),
    txDate: date("tx_date"),
    message: text("message").notNull(),
    adminReply: text("admin_reply"),
    status: varchar("status", { length: 20 }).notNull().default("Pending"),
    userId: integer("user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    repliedAt: timestamp("replied_at"),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    statusIdx: index("inquiries_status_idx").on(t.status),
    createdIdx: index("inquiries_created_idx").on(t.createdAt),
    userIdx: index("inquiries_user_idx").on(t.userId),
  }),
);

export const insertInquirySchema = createInsertSchema(inquiriesTable).omit({
  id: true,
  status: true,
  createdAt: true,
  repliedAt: true,
  resolvedAt: true,
});
export type Inquiry = typeof inquiriesTable.$inferSelect;
export const inquiryZ: z.ZodType<Inquiry> = z.any();

import { pgTable, serial, integer, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { paymentsTable } from "./payments";

export const paymentRemindersTable = pgTable(
  "payment_reminders",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id").notNull().references(() => paymentsTable.id, { onDelete: "cascade" }),
    reminderType: varchar("reminder_type", { length: 32 }).notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqPaymentReminder: uniqueIndex("uniq_payment_reminder").on(t.paymentId, t.reminderType),
  }),
);

export type PaymentReminder = typeof paymentRemindersTable.$inferSelect;

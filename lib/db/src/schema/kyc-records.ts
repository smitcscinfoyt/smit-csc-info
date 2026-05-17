import { pgTable, serial, integer, varchar, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const kycRecordsTable = pgTable("kyc_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  level: varchar("level", { length: 20 }).notNull().default("full"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  kycMethod: varchar("kyc_method", { length: 20 }).notNull().default("manual"),

  fullName: varchar("full_name", { length: 200 }).notNull(),
  dob: varchar("dob", { length: 20 }).notNull(),
  panNumber: varchar("pan_number", { length: 20 }).notNull(),
  aadhaarLast4: varchar("aadhaar_last4", { length: 4 }).notNull(),
  addressLine: text("address_line").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  pincode: varchar("pincode", { length: 10 }).notNull(),

  panImageUrl: text("pan_image_url").notNull(),
  aadhaarFrontUrl: text("aadhaar_front_url").notNull(),
  aadhaarBackUrl: text("aadhaar_back_url").notNull(),
  selfieUrl: text("selfie_url").notNull(),

  ocrPanExtracted: varchar("ocr_pan_extracted", { length: 20 }),
  ocrNameExtracted: varchar("ocr_name_extracted", { length: 200 }),
  ocrAadhaarExtracted: varchar("ocr_aadhaar_extracted", { length: 4 }),
  ocrConfidence: varchar("ocr_confidence", { length: 20 }),

  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  rejectReason: text("reject_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertKycRecordSchema = createInsertSchema(kycRecordsTable).omit({
  id: true, createdAt: true, updatedAt: true, submittedAt: true, reviewedAt: true,
});
export type InsertKycRecord = z.infer<typeof insertKycRecordSchema>;
export type KycRecord = typeof kycRecordsTable.$inferSelect;

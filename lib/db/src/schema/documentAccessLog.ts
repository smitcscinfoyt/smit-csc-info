import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { documentsTable } from "./documents";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentAccessLogTable = pgTable("document_access_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  documentId: integer("document_id").notNull().references(() => documentsTable.id),
  action: text("action").notNull(), // 'preview' or 'download'
  format: text("format").notNull(), // 'pdf', 'word', 'webp'
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
});

export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLogTable).omit({ id: true, accessedAt: true });
export type InsertDocumentAccessLog = z.infer<typeof insertDocumentAccessLogSchema>;
export type DocumentAccessLog = typeof documentAccessLogTable.$inferSelect;

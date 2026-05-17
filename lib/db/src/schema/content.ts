import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contentTable = pgTable("content", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  titleGu: text("title_gu"),
  category: text("category").notNull(),
  type: text("type").notNull(),
  link: text("link").notNull(),
  description: text("description"),
  isPrime: boolean("is_prime").notNull().default(false),
  thumbnailUrl: text("thumbnail_url"),
  // YouTube sync fields
  youtubeVideoId: text("youtube_video_id"),
  playlistTitle: text("playlist_title"),
  playlistId: text("playlist_id"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContentSchema = createInsertSchema(contentTable).omit({ id: true, createdAt: true });
export type InsertContent = z.infer<typeof insertContentSchema>;
export type Content = typeof contentTable.$inferSelect;

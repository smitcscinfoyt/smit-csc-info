import { pgTable, serial, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

export const newsCacheTable = pgTable(
  "news_cache",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    body: text("body"),
    imageUrl: text("image_url"),
    url: text("url").notNull().unique(),
    source: varchar("source", { length: 200 }),
    language: varchar("language", { length: 10 }),
    publishedAt: timestamp("published_at"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => ({
    publishedIdx: index("news_cache_published_idx").on(t.publishedAt),
    fetchedIdx: index("news_cache_fetched_idx").on(t.fetchedAt),
  }),
);

export type NewsCacheRow = typeof newsCacheTable.$inferSelect;

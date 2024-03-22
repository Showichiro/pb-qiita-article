import { relations, text, integer, sqliteTable } from "@/lib";

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  createdAt: text("created_at").notNull(),
  likesCount: integer("likes_count").notNull(),
  stocksCount: integer("stocks_count").notNull(),
});

export const articleRelation = relations(articles, ({ many }) => ({
  tags: many(tags),
}));

export const tags = sqliteTable("tags", {
  articleId: text("article_id").references(() => articles.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const tagRelation = relations(tags, ({ one }) => ({
  article: one(articles, {
    fields: [tags.articleId],
    references: [articles.id],
  }),
}));

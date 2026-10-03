import {
  foreignKey,
  index,
  integer,
  primaryKey,
  relations,
  sqliteTable,
  text,
  uniqueIndex,
} from "@/lib";

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

export const dataGenerations = sqliteTable(
  "data_generations",
  {
    id: text("id").primaryKey(),
    state: text("state").notNull(),
    ownerId: text("owner_id"),
    basedOnGenerationId: text("based_on_generation_id"),
    createdAt: text("created_at").notNull(),
    manifestDigest: text("manifest_digest"),
    articleCount: integer("article_count"),
    tagCount: integer("tag_count"),
    publishedSequence: integer("published_sequence"),
  },
  (table) => [
    uniqueIndex("data_generations_published_seq_idx").on(
      table.publishedSequence,
    ),
  ],
);

export const activeDataGeneration = sqliteTable("active_data_generation", {
  singleton: integer("singleton").primaryKey(),
  generationId: text("generation_id")
    .notNull()
    .references(() => dataGenerations.id),
  publishedSequence: integer("published_sequence").notNull(),
});

export const generationArticles = sqliteTable(
  "generation_articles",
  {
    generationId: text("generation_id")
      .notNull()
      .references(() => dataGenerations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    title: text("title").notNull(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    createdAt: text("created_at").notNull(),
    likesCount: integer("likes_count").notNull(),
    stocksCount: integer("stocks_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generationId, table.id] }),
    index("generation_articles_version_created_idx").on(
      table.generationId,
      table.createdAt,
    ),
  ],
);

export const generationArticleRelation = relations(
  generationArticles,
  ({ many }) => ({
    tags: many(generationTags),
  }),
);

export const generationTags = sqliteTable(
  "generation_tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    generationId: text("generation_id")
      .notNull()
      .references(() => dataGenerations.id, { onDelete: "cascade" }),
    articleId: text("article_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.generationId, table.articleId],
      foreignColumns: [generationArticles.generationId, generationArticles.id],
    }).onDelete("cascade"),
    index("generation_tags_version_article_idx").on(
      table.generationId,
      table.articleId,
    ),
    index("generation_tags_version_name_idx").on(
      table.generationId,
      table.name,
    ),
    uniqueIndex("generation_tags_article_position_idx").on(
      table.generationId,
      table.articleId,
      table.position,
    ),
  ],
);

export const generationTagRelation = relations(generationTags, ({ one }) => ({
  article: one(generationArticles, {
    fields: [generationTags.generationId, generationTags.articleId],
    references: [generationArticles.generationId, generationArticles.id],
  }),
}));

export const generationRelation = relations(dataGenerations, ({ many }) => ({
  articles: many(generationArticles),
  tags: many(generationTags),
}));

export const tagRelation = relations(tags, ({ one }) => ({
  article: one(articles, {
    fields: [tags.articleId],
    references: [articles.id],
  }),
}));

import { readFile } from "node:fs/promises";

/** Apply the real generation migration to an existing legacy test fixture. */
export async function migrateTestGeneration(db: D1Database): Promise<void> {
  const migration = await readFile(
    "migrations/0001_add_versioned_data.sql",
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint"))
    if (statement.trim()) await db.prepare(statement).run();
}

/** Tests may replace fixtures between assertions; production generations stay immutable. */
export async function refreshTestGeneration(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM generation_tags WHERE generation_id='legacy'"),
    db.prepare("DELETE FROM generation_articles WHERE generation_id='legacy'"),
    db.prepare(
      "INSERT INTO generation_articles SELECT 'legacy',id,title,user_id,user_name,created_at,likes_count,stocks_count FROM articles",
    ),
    db.prepare(
      "INSERT INTO generation_tags (generation_id,article_id,name,position) SELECT 'legacy',article_id,name,id FROM tags WHERE article_id IS NOT NULL",
    ),
    db.prepare(
      "UPDATE data_generations SET state='published',published_sequence=1,article_count=(SELECT COUNT(*) FROM articles),tag_count=(SELECT COUNT(*) FROM tags WHERE article_id IS NOT NULL) WHERE id='legacy'",
    ),
  ]);
}

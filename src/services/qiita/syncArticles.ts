import { type Article, fetchQiitaArticles } from "./fetchArticles";

const fields = [
  "title",
  "userId",
  "userName",
  "createdAt",
  "likesCount",
  "stocksCount",
] as const;
const tagKey = (tags: string[]) => JSON.stringify([...new Set(tags)].sort());

export function diffArticles(current: Article[], latest: Article[]) {
  const existing = new Map(current.map((article) => [article.id, article]));
  const incoming = new Set(latest.map((article) => article.id));
  return {
    inserted: latest.filter((article) => !existing.has(article.id)),
    updated: latest.filter((article) => {
      const old = existing.get(article.id);
      return old && fields.some((field) => old[field] !== article[field]);
    }),
    tagsChanged: latest.filter((article) => {
      const old = existing.get(article.id);
      return old && tagKey(old.tags) !== tagKey(article.tags);
    }),
    deleted: current.filter((article) => !incoming.has(article.id)),
  };
}

export async function readCurrentArticles(db: D1Database): Promise<Article[]> {
  const [articles, tags] = await db.batch([
    db.prepare(
      "SELECT id, title, user_id AS userId, user_name AS userName, created_at AS createdAt, likes_count AS likesCount, stocks_count AS stocksCount FROM articles",
    ),
    db.prepare("SELECT article_id AS articleId, name FROM tags"),
  ]);
  const byArticle = new Map<string, string[]>();
  for (const tag of tags.results as { articleId: string; name: string }[]) {
    const names = byArticle.get(tag.articleId) ?? [];
    names.push(tag.name);
    byArticle.set(tag.articleId, names);
  }
  return (articles.results as Omit<Article, "tags">[]).map((article) => ({
    ...article,
    tags: byArticle.get(article.id) ?? [],
  }));
}

export async function syncArticles(
  db: D1Database,
  token: string,
  request: typeof fetch = fetch,
) {
  const latest = await fetchQiitaArticles(token, request);
  const changes = diffArticles(await readCurrentArticles(db), latest);
  const statements: D1PreparedStatement[] = [];
  for (const article of changes.inserted) {
    statements.push(
      db
        .prepare(
          "INSERT INTO articles (id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(article.id, ...fields.map((field) => article[field])),
    );
  }
  for (const article of changes.updated) {
    statements.push(
      db
        .prepare(
          "UPDATE articles SET title = ?, user_id = ?, user_name = ?, created_at = ?, likes_count = ?, stocks_count = ? WHERE id = ?",
        )
        .bind(...fields.map((field) => article[field]), article.id),
    );
  }
  for (const article of changes.tagsChanged) {
    statements.push(
      db.prepare("DELETE FROM tags WHERE article_id = ?").bind(article.id),
    );
  }
  for (const article of [...changes.inserted, ...changes.tagsChanged]) {
    for (const tag of [...new Set(article.tags)]) {
      statements.push(
        db
          .prepare("INSERT INTO tags (article_id, name) VALUES (?, ?)")
          .bind(article.id, tag),
      );
    }
  }
  for (const article of changes.deleted) {
    statements.push(
      db.prepare("DELETE FROM articles WHERE id = ?").bind(article.id),
    );
  }
  // One transactional batch keeps article/tag changes and deletions atomic.
  if (statements.length) await db.batch(statements);
  return {
    fetched: latest.length,
    inserted: changes.inserted.length,
    updated: changes.updated.length,
    tagsChanged: changes.tagsChanged.length,
    deleted: changes.deleted.length,
    statements: statements.length,
  };
}

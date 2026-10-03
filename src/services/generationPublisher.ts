import { z } from "zod";
import { fetchQiitaArticles } from "./qiita/fetchArticles";

const itemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  created_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  likes_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  stocks_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  user: z.object({ id: z.string().min(1), name: z.string() }),
  tags: z.array(z.object({ name: z.string().min(1) })).max(20),
});
export type QiitaItem = z.infer<typeof itemSchema>;
export type GenerationConfig = {
  db: D1Database;
  ownerId: string;
  basedOnGenerationId?: string | null;
  maxChunkRows: number;
  maxChunkStatements: number;
};
export type PublishResult = {
  generationId: string;
  publishedSequence: number;
  preserved: boolean;
};
type ActiveGeneration = {
  id: string;
  published_sequence: number;
  manifest_digest: string | null;
};

function validateItems(input: QiitaItem[]): QiitaItem[] {
  const items = z.array(itemSchema).max(10_000).parse(input);
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error("Duplicate Qiita article ID");
    ids.add(item.id);
    item.tags = [...new Set(item.tags.map((tag) => tag.name))]
      .sort()
      .map((name) => ({ name }));
  }
  return items;
}
function validateConfig(config: GenerationConfig): void {
  if (
    !config.ownerId ||
    !Number.isSafeInteger(config.maxChunkRows) ||
    config.maxChunkRows < 1 ||
    config.maxChunkRows > 1000 ||
    !Number.isSafeInteger(config.maxChunkStatements) ||
    config.maxChunkStatements < 1 ||
    config.maxChunkStatements > 100
  )
    throw new Error(
      "Import chunks must use positive bounded integer limits and an owner ID",
    );
}
async function activeGeneration(
  db: D1Database,
): Promise<ActiveGeneration | null> {
  return db
    .prepare(
      "SELECT g.id, g.published_sequence, g.manifest_digest FROM active_data_generation a JOIN data_generations g ON g.id = a.generation_id WHERE a.singleton = 1 AND g.state = 'published'",
    )
    .first<ActiveGeneration>();
}
export async function fetchAllQiitaItems(options: {
  token: string;
  organization?: string;
  perPage?: number;
}): Promise<QiitaItem[]> {
  if (
    options.organization !== undefined &&
    options.organization !== "primebrains"
  )
    throw new Error("Unsupported organization");
  if (options.perPage !== undefined && options.perPage !== 100)
    throw new Error("Complete snapshot fetching requires 100 items per page");
  const articles = await fetchQiitaArticles(options.token);
  return validateItems(
    articles.map((article) => ({
      id: article.id,
      title: article.title,
      user: { id: article.userId, name: article.userName },
      created_at: article.createdAt,
      likes_count: article.likesCount,
      stocks_count: article.stocksCount,
      tags: article.tags.map((name) => ({ name })),
    })),
  );
}
export async function computeManifestDigest(
  input: QiitaItem[],
): Promise<string> {
  const items = validateItems(input).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const canonical = JSON.stringify(
    items.map((item) => [
      item.id,
      item.title,
      item.user.id,
      item.user.name,
      item.created_at,
      item.likes_count,
      item.stocks_count,
      item.tags.map((tag) => tag.name),
    ]),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function stageGeneration(
  config: GenerationConfig,
  input: QiitaItem[],
  generationId: string,
): Promise<{ articleCount: number; tagCount: number }> {
  validateConfig(config);
  const items = validateItems(input);
  const { db, ownerId, maxChunkRows, maxChunkStatements } = config;
  let pending: D1PreparedStatement[] = [];
  let chunkRows = 0;
  async function flush() {
    if (!pending.length) return;
    const results = await db.batch(pending);
    if (results.some((result) => !result.success || result.meta.changes !== 1))
      throw new Error("Generation write fence failed");
    pending = [];
    chunkRows = 0;
  }
  async function add(statement: D1PreparedStatement) {
    if (pending.length >= maxChunkStatements) await flush();
    pending.push(statement);
  }
  for (const item of items) {
    if (chunkRows >= maxChunkRows) await flush();
    await add(
      db
        .prepare(
          "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM data_generations WHERE id = ? AND owner_id = ? AND state = 'staging')",
        )
        .bind(
          generationId,
          item.id,
          item.title,
          item.user.id,
          item.user.name,
          item.created_at,
          item.likes_count,
          item.stocks_count,
          generationId,
          ownerId,
        ),
    );
    chunkRows++;
    for (let position = 0; position < item.tags.length; position++)
      await add(
        db
          .prepare(
            "INSERT INTO generation_tags (generation_id, article_id, name, position) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM data_generations WHERE id = ? AND owner_id = ? AND state = 'staging')",
          )
          .bind(
            generationId,
            item.id,
            item.tags[position].name,
            position,
            generationId,
            ownerId,
          ),
      );
  }
  await flush();
  const expected = {
    articleCount: items.length,
    tagCount: items.reduce((count, item) => count + item.tags.length, 0),
  };
  const actual = await db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM generation_articles WHERE generation_id = ?) AS articleCount, (SELECT COUNT(*) FROM generation_tags WHERE generation_id = ?) AS tagCount",
    )
    .bind(generationId, generationId)
    .first<typeof expected>();
  if (
    !actual ||
    actual.articleCount !== expected.articleCount ||
    actual.tagCount !== expected.tagCount
  )
    throw new Error("Generation manifest counts do not match");
  return expected;
}
async function failGeneration(
  db: D1Database,
  id: string,
  ownerId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE data_generations SET state = 'failed' WHERE id = ? AND owner_id = ? AND state IN ('staging', 'ready') AND id NOT IN (SELECT generation_id FROM active_data_generation)",
    )
    .bind(id, ownerId)
    .run();
  await db
    .prepare(
      "DELETE FROM data_generations WHERE id = ? AND owner_id = ? AND state = 'failed' AND id NOT IN (SELECT generation_id FROM active_data_generation)",
    )
    .bind(id, ownerId)
    .run();
}
export async function retainGenerations(
  db: D1Database,
  retainCount: number,
): Promise<void> {
  if (
    !Number.isSafeInteger(retainCount) ||
    retainCount < 1 ||
    retainCount > 100
  )
    throw new Error("Invalid generation retention limit");
  await db
    .prepare(
      "DELETE FROM data_generations WHERE state = 'published' AND id NOT IN (SELECT generation_id FROM active_data_generation) AND id NOT IN (SELECT id FROM data_generations WHERE state = 'published' ORDER BY published_sequence DESC LIMIT ?)",
    )
    .bind(retainCount)
    .run();
}
export async function publishGeneration(
  config: GenerationConfig,
  generationId: string,
  digest: string,
  articleCount: number,
  tagCount: number,
): Promise<PublishResult> {
  validateConfig(config);
  if (
    !/^[0-9a-f]{64}$/.test(digest) ||
    !Number.isSafeInteger(articleCount) ||
    articleCount < 0 ||
    !Number.isSafeInteger(tagCount) ||
    tagCount < 0
  )
    throw new Error("Invalid generation manifest");
  const { db, ownerId } = config;
  const active = await activeGeneration(db);
  const basedOn = config.basedOnGenerationId ?? null;
  if ((active?.id ?? null) !== basedOn)
    throw new Error("CAS failed: active generation changed");
  const ready = await db
    .prepare(
      "UPDATE data_generations SET state = 'ready', manifest_digest = ?, article_count = ?, tag_count = ? WHERE id = ? AND owner_id = ? AND state = 'staging' AND based_on_generation_id IS ? AND ? = (SELECT COUNT(*) FROM generation_articles WHERE generation_id = ?) AND ? = (SELECT COUNT(*) FROM generation_tags WHERE generation_id = ?)",
    )
    .bind(
      digest,
      articleCount,
      tagCount,
      generationId,
      ownerId,
      basedOn,
      articleCount,
      generationId,
      tagCount,
      generationId,
    )
    .run();
  if (ready.meta.changes !== 1)
    throw new Error("Generation ready fence or manifest validation failed");
  if (active?.manifest_digest === digest) {
    // Check the pointer again at the atomic write, rather than preserving a stale base.
    const preserved = await db
      .prepare(
        "UPDATE data_generations SET state = 'failed' WHERE id = ? AND owner_id = ? AND state = 'ready' AND EXISTS (SELECT 1 FROM active_data_generation WHERE generation_id = ?)",
      )
      .bind(generationId, ownerId, basedOn)
      .run();
    if (preserved.meta.changes !== 1)
      throw new Error("CAS failed while preserving generation");
    await failGeneration(db, generationId, ownerId);
    return {
      generationId: active.id,
      publishedSequence: active.published_sequence,
      preserved: true,
    };
  }
  const nextSequence = (active?.published_sequence ?? 0) + 1;
  const results = await db.batch([
    db
      .prepare(
        "UPDATE data_generations SET state = 'published', published_sequence = ? WHERE id = ? AND owner_id = ? AND state = 'ready' AND based_on_generation_id IS ? AND ((? IS NULL AND NOT EXISTS (SELECT 1 FROM active_data_generation)) OR EXISTS (SELECT 1 FROM active_data_generation WHERE singleton = 1 AND generation_id = ? AND published_sequence = ?))",
      )
      .bind(
        nextSequence,
        generationId,
        ownerId,
        basedOn,
        basedOn,
        basedOn,
        nextSequence - 1,
      ),
    db
      .prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) SELECT 1, id, published_sequence FROM data_generations WHERE id = ? AND owner_id = ? AND state = 'published' AND published_sequence = ? AND based_on_generation_id IS ? ON CONFLICT(singleton) DO UPDATE SET generation_id = excluded.generation_id, published_sequence = excluded.published_sequence WHERE active_data_generation.generation_id IS ? AND active_data_generation.published_sequence = ?",
      )
      .bind(
        generationId,
        ownerId,
        nextSequence,
        basedOn,
        basedOn,
        nextSequence - 1,
      ),
  ]);
  if (results.some((result) => !result.success || result.meta.changes !== 1))
    throw new Error("CAS failed: publication was not committed");
  // A cleanup failure cannot undo an already committed publication.
  try {
    await retainGenerations(db, 3);
  } catch (error) {
    console.error("Published generation retention failed", error);
  }
  return { generationId, publishedSequence: nextSequence, preserved: false };
}
export async function importQiitaGeneration(
  config: GenerationConfig,
  fetchOptions: { token: string; organization?: string; perPage?: number },
): Promise<PublishResult> {
  validateConfig(config);
  // Complete and validate every page before reading or writing D1.
  const items = await fetchAllQiitaItems(fetchOptions);
  const digest = await computeManifestDigest(items);
  const active = await activeGeneration(config.db);
  const basedOn =
    config.basedOnGenerationId === undefined
      ? (active?.id ?? null)
      : config.basedOnGenerationId;
  if ((active?.id ?? null) !== basedOn)
    throw new Error("CAS failed: import base changed");
  if (active?.manifest_digest === digest) {
    const current = await activeGeneration(config.db);
    if (current?.id !== active.id)
      throw new Error("CAS failed while preserving generation");
    return {
      generationId: active.id,
      publishedSequence: active.published_sequence,
      preserved: true,
    };
  }
  const generationId = crypto.randomUUID();
  const resolvedConfig = { ...config, basedOnGenerationId: basedOn };
  await config.db
    .prepare(
      "INSERT INTO data_generations (id, state, owner_id, based_on_generation_id, created_at) VALUES (?, 'staging', ?, ?, ?)",
    )
    .bind(generationId, config.ownerId, basedOn, new Date().toISOString())
    .run();
  try {
    const counts = await stageGeneration(resolvedConfig, items, generationId);
    return await publishGeneration(
      resolvedConfig,
      generationId,
      digest,
      counts.articleCount,
      counts.tagCount,
    );
  } catch (error) {
    try {
      await failGeneration(config.db, generationId, config.ownerId);
    } catch (cleanupError) {
      console.error("Failed generation cleanup failed", cleanupError);
    }
    throw error;
  }
}

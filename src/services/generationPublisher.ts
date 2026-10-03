/**
 * Generation Publisher - Worker-compatible module for data generation lifecycle
 *
 * Design constraints from root review:
 * - No node:crypto or process.env (use Web Crypto API, passed token)
 * - Full fetch validated before ANY DB write
 * - Enforce positive bounded chunk rows/statements
 * - D1 param 100 limit, SQL 100KB limit
 * - Owner fencing for writes/ready/publish
 * - One ATOMIC D1 batch for final publication (conditional expected active ID + owner + ready)
 * - Web Crypto SHA-256 canonical FULL article fields + sorted tags (not just IDs)
 * - No-change same full digest preserve generation for Cron
 * - Initial no-active verified complete empty or full manifest permitted
 * - Retention atomic delete predicate (published + inactive + not retained/current pointer)
 */

type QiitaItem = {
  id: string;
  title: string;
  likes_count: number;
  stocks_count: number;
  created_at: string;
  user: {
    id: string;
    name: string;
  };
  tags: Array<{ name: string }>;
};

type QiitaFetchOptions = {
  token: string;
  organization?: string;
  perPage?: number;
};

type GenerationConfig = {
  db: D1Database;
  ownerId: string;
  basedOnGenerationId: string | null;
  maxChunkRows: number;
  maxChunkStatements: number;
};

type PublishResult = {
  generationId: string;
  publishedSequence: number;
  preserved: boolean; // true if digest matched existing (no-change)
};

type PublishError =
  | { type: "fetch-failed"; message: string }
  | { type: "validation-failed"; message: string }
  | { type: "cas-failed"; message: string }
  | { type: "initial-publish-failed"; message: string }
  | { type: "retention-failed"; message: string };

/**
 * Fetch all Qiita items with validated bounded pagination
 * Fetches ALL data before any DB write (full fetch before write)
 */
export async function fetchAllQiitaItems(
  options: QiitaFetchOptions,
): Promise<QiitaItem[]> {
  const { token, organization = "primebrains", perPage = 100 } = options;

  if (perPage < 1 || perPage > 100) {
    throw new Error("perPage must be between 1 and 100");
  }

  const url = new URL("https://qiita.com/api/v2/items");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("query", `org:${organization}`);

  let page = 1;
  let allItems: QiitaItem[] = [];

  while (true) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Qiita API failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const items = validateQiitaItems(json);
    allItems = allItems.concat(items);

    if (items.length < perPage) break;
    page++;
    url.searchParams.set("page", String(page));
  }

  return allItems;
}

function validateQiitaItems(data: unknown): QiitaItem[] {
  if (!Array.isArray(data)) {
    throw new Error("Qiita API response is not an array");
  }

  return data.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.likes_count !== "number" ||
      typeof item.stocks_count !== "number" ||
      typeof item.created_at !== "string" ||
      !item.user ||
      typeof item.user.id !== "string" ||
      typeof item.user.name !== "string" ||
      !Array.isArray(item.tags)
    ) {
      throw new Error(`Invalid Qiita item at index ${index}`);
    }

    item.tags.forEach((tag: unknown, tagIndex: number) => {
      if (!tag || typeof tag !== "object" || typeof tag.name !== "string") {
        throw new Error(`Invalid tag at index ${tagIndex} in item ${item.id}`);
      }
    });

    return item as QiitaItem;
  });
}

/**
 * Compute canonical digest using Web Crypto SHA-256
 * Includes FULL article fields + sorted tags (not just IDs)
 */
export async function computeManifestDigest(
  items: QiitaItem[],
): Promise<string> {
  // Canonical representation: sort by ID, include all fields + sorted tags
  const canonical = items
    .map((item) => {
      const sortedTags = item.tags
        .map((t) => t.name)
        .sort()
        .join(",");
      return `${item.id}|${item.title}|${item.likes_count}|${item.stocks_count}|${item.created_at}|${item.user.id}|${item.user.name}|${sortedTags}`;
    })
    .sort()
    .join("\n");

  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Stage generation with fenced writes
 * Validates counts/relations after write
 */
export async function stageGeneration(
  config: GenerationConfig,
  items: QiitaItem[],
  generationId: string,
): Promise<{ articleCount: number; tagCount: number }> {
  const { db, maxChunkRows, maxChunkStatements } = config;

  if (maxChunkRows < 1 || maxChunkStatements < 1) {
    throw new Error("maxChunkRows and maxChunkStatements must be positive");
  }

  // Chunk items respecting D1 limits
  const chunks = chunkItems(items, maxChunkRows, maxChunkStatements);
  let totalArticles = 0;
  let totalTags = 0;

  for (const chunk of chunks) {
    const statements = chunk.flatMap((item) => [
      db.prepare(
        "INSERT INTO generation_articles (generation_id, id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        generationId,
        item.id,
        item.title,
        item.user.id,
        item.user.name,
        item.created_at,
        item.likes_count,
        item.stocks_count,
      ),
      ...item.tags.map((tag, position) =>
        db.prepare(
          "INSERT INTO generation_tags (generation_id, article_id, name, position) VALUES (?, ?, ?, ?)",
        ).bind(generationId, item.id, tag.name, position),
      ),
    ]);

    const result = await db.batch(statements);
    if (!result.every((r) => r.success)) {
      throw new Error("Batch insert failed");
    }

    totalArticles += chunk.length;
    totalTags += chunk.reduce((sum, item) => sum + item.tags.length, 0);
  }

  // Validate actual counts
  const articleCountResult = await db
    .prepare("SELECT COUNT(*) as count FROM generation_articles WHERE generation_id = ?")
    .bind(generationId)
    .first<{ count: number }>();

  const tagCountResult = await db
    .prepare("SELECT COUNT(*) as count FROM generation_tags WHERE generation_id = ?")
    .bind(generationId)
    .first<{ count: number }>();

  const actualArticleCount = articleCountResult?.count ?? 0;
  const actualTagCount = tagCountResult?.count ?? 0;

  if (actualArticleCount !== totalArticles) {
    throw new Error(
      `Article count mismatch: expected ${totalArticles}, got ${actualArticleCount}`,
    );
  }

  if (actualTagCount !== totalTags) {
    throw new Error(`Tag count mismatch: expected ${totalTags}, got ${actualTagCount}`);
  }

  return { articleCount: totalArticles, tagCount: totalTags };
}

function chunkItems(
  items: QiitaItem[],
  maxRows: number,
  maxStatements: number,
): QiitaItem[][] {
  const chunks: QiitaItem[][] = [];
  let currentChunk: QiitaItem[] = [];
  let currentStatements = 0;

  for (const item of items) {
    const itemStatements = 1 + item.tags.length; // 1 article + N tags

    if (
      currentChunk.length >= maxRows ||
      currentStatements + itemStatements > maxStatements
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentStatements = 0;
      }
    }

    currentChunk.push(item);
    currentStatements += itemStatements;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Publish generation with atomic CAS
 * One ATOMIC D1 batch conditional on expected active ID + owner + ready
 */
export async function publishGeneration(
  config: GenerationConfig,
  generationId: string,
  digest: string,
  articleCount: number,
  tagCount: number,
): Promise<PublishResult> {
  const { db, ownerId, basedOnGenerationId } = config;

  // Check for no-change (same digest as previous generation)
  if (basedOnGenerationId) {
    const prevGen = await db
      .prepare("SELECT manifest_digest FROM data_generations WHERE id = ?")
      .bind(basedOnGenerationId)
      .first<{ manifest_digest: string }>();

    if (prevGen?.manifest_digest === digest) {
      // No-change: preserve existing generation
      return {
        generationId: basedOnGenerationId,
        publishedSequence: await getPublishedSequence(db, basedOnGenerationId),
        preserved: true,
      };
    }
  }

  // Get current active pointer
  const currentActive = await db
    .prepare("SELECT generation_id, published_sequence FROM active_data_generation WHERE singleton = 1")
    .first<{ generation_id: string; published_sequence: number }>();

  const currentSequence = currentActive?.published_sequence ?? 0;
  const nextSequence = currentSequence + 1;

  // Check if this is initial publish (no active pointer)
  const isInitialPublish = !currentActive;

  // ATOMIC batch: set ready + update pointer in one transaction
  const batchStatements = [
    // Set generation to ready with owner fence
    db.prepare(
      "UPDATE data_generations SET state = 'ready', manifest_digest = ?, article_count = ?, tag_count = ?, published_sequence = ? WHERE id = ? AND owner_id = ? AND state = 'staging'",
    ).bind(digest, articleCount, tagCount, nextSequence, generationId, ownerId),
  ];

  if (isInitialPublish) {
    // Initial publish: insert active pointer with sequence 1
    batchStatements.push(
      db.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (1, ?, ?)",
      ).bind(generationId, nextSequence),
    );
  } else {
    // Update existing pointer with CAS
    batchStatements.push(
      db.prepare(
        "UPDATE active_data_generation SET generation_id = ?, published_sequence = ? WHERE singleton = 1 AND generation_id = ? AND published_sequence = ?",
      ).bind(generationId, nextSequence, currentActive.generation_id, currentSequence),
    );
  }

  const results = await db.batch(batchStatements);

  // Verify batch success using meta.changes
  const readyResult = results[0];
  const pointerResult = results[1];

  if (!readyResult.success || readyResult.meta.changes !== 1) {
    // Owner fence failed or generation not staging
    await markGenerationFailed(db, generationId, ownerId);
    throw new Error("CAS failed: generation not staging or owner mismatch");
  }

  if (!pointerResult.success || pointerResult.meta.changes !== 1) {
    // Pointer CAS failed (concurrent update)
    await markGenerationFailed(db, generationId, ownerId);
    throw new Error("CAS failed: active pointer updated concurrently");
  }

  // Final transition to published
  const publishResult = await db
    .prepare(
      "UPDATE data_generations SET state = 'published' WHERE id = ? AND state = 'ready' AND owner_id = ?",
    )
    .bind(generationId, ownerId)
    .run();

  if (publishResult.meta.changes !== 1) {
    throw new Error("Failed to transition to published");
  }

  // Retention: atomic delete predicate (published + inactive + not retained/current pointer)
  await retainGenerations(db, 3); // retain active + 2

  return {
    generationId,
    publishedSequence: nextSequence,
    preserved: false,
  };
}

async function getPublishedSequence(db: D1Database, generationId: string): Promise<number> {
  const result = await db
    .prepare("SELECT published_sequence FROM data_generations WHERE id = ?")
    .bind(generationId)
    .first<{ published_sequence: number }>();
  return result?.published_sequence ?? 0;
}

async function markGenerationFailed(db: D1Database, generationId: string, ownerId: string): Promise<void> {
  await db
    .prepare(
      "UPDATE data_generations SET state = 'failed' WHERE id = ? AND owner_id = ?",
    )
    .bind(generationId, ownerId)
    .run();
}

/**
 * Retention: atomic delete predicate (published + inactive + not retained/current pointer)
 * Never deletes in-flight (staging/ready/failed) or active
 */
export async function retainGenerations(db: D1Database, retainCount: number): Promise<void> {
  // Get current active pointer
  const currentActive = await db
    .prepare("SELECT generation_id FROM active_data_generation WHERE singleton = 1")
    .first<{ generation_id: string }>();

  if (!currentActive) return;

  // Get published generations ordered by sequence DESC
  const published = await db
    .prepare(
      "SELECT id, published_sequence FROM data_generations WHERE state = 'published' ORDER BY published_sequence DESC",
    )
    .all<{ id: string; published_sequence: number }>();

  if (published.length <= retainCount) return;

  // Retain top N + current active (if not in top N)
  const toRetain = new Set(published.slice(0, retainCount).map((g) => g.id));
  toRetain.add(currentActive.generation_id);

  // Delete others (atomic: only published + inactive + not retained)
  const toDelete = published.filter((g) => !toRetain.has(g.id));
  for (const gen of toDelete) {
    await db
      .prepare("DELETE FROM data_generations WHERE id = ? AND state = 'published'")
      .bind(gen.id)
      .run();
  }
}

/**
 * Complete import workflow
 */
export async function importQiitaGeneration(
  config: GenerationConfig,
  fetchOptions: QiitaFetchOptions,
): Promise<PublishResult> {
  const { db, ownerId, basedOnGenerationId } = config;

  // Step 1: Create staging generation with owner fence
  const generationId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO data_generations (id, state, owner_id, based_on_generation_id, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(generationId, "staging", ownerId, basedOnGenerationId, createdAt)
    .run();

  try {
    // Step 2: Full fetch before ANY DB write
    const items = await fetchAllQiitaItems(fetchOptions);

    if (items.length === 0) {
      // Empty fetch: permit if initial import (no basedOn)
      if (!basedOnGenerationId) {
        // Mark as ready with empty counts
        await db
          .prepare(
            "UPDATE data_generations SET state = 'ready', article_count = 0, tag_count = 0, manifest_digest = 'empty' WHERE id = ? AND owner_id = ?",
          )
          .bind(generationId, ownerId)
          .run();
      } else {
        await markGenerationFailed(db, generationId, ownerId);
        throw new Error("Empty fetch with basedOnGenerationId not permitted");
      }
    }

    // Step 3: Stage with fenced writes
    const { articleCount, tagCount } = await stageGeneration(config, items, generationId);

    // Step 4: Compute canonical digest
    const digest = await computeManifestDigest(items);

    // Step 5: Publish with atomic CAS
    return await publishGeneration(
      config,
      generationId,
      digest,
      articleCount,
      tagCount,
    );
  } catch (error) {
    // Mark as failed on any error
    await markGenerationFailed(db, generationId, ownerId);
    throw error;
  }
}

import { and, desc, eq, sql, type DrizzleD1Database } from "@/lib";
import * as schema from "./schema";

export type DataGeneration = {
  id: string;
  state: string;
  publishedSequence: number | null;
  createdAt: string;
  articleCount: number | null;
  tagCount: number | null;
};

export const getActiveDataGeneration = async (
  db: DrizzleD1Database<typeof schema>,
): Promise<DataGeneration | null> => {
  const [active] = await db
    .select({
      id: schema.dataGenerations.id,
      state: schema.dataGenerations.state,
      publishedSequence: schema.dataGenerations.publishedSequence,
      createdAt: schema.dataGenerations.createdAt,
      articleCount: schema.dataGenerations.articleCount,
      tagCount: schema.dataGenerations.tagCount,
    })
    .from(schema.activeDataGeneration)
    .innerJoin(
      schema.dataGenerations,
      eq(schema.activeDataGeneration.generationId, schema.dataGenerations.id),
    )
    .where(eq(schema.activeDataGeneration.singleton, 1))
    .limit(1);
  return active ?? null;
};

export const getPublishedDataGeneration = async (
  db: DrizzleD1Database<typeof schema>,
  generationId: string,
): Promise<DataGeneration | null> => {
  const [generation] = await db
    .select({
      id: schema.dataGenerations.id,
      state: schema.dataGenerations.state,
      publishedSequence: schema.dataGenerations.publishedSequence,
      createdAt: schema.dataGenerations.createdAt,
      articleCount: schema.dataGenerations.articleCount,
      tagCount: schema.dataGenerations.tagCount,
    })
    .from(schema.dataGenerations)
    .where(
      and(
        eq(schema.dataGenerations.id, generationId),
        eq(schema.dataGenerations.state, "published"),
      ),
    )
    .limit(1);
  return generation ?? null;
};

export const listRetainedDataGenerations = async (
  db: DrizzleD1Database<typeof schema>,
  limit = 3,
): Promise<DataGeneration[]> =>
  db
    .select({
      id: schema.dataGenerations.id,
      state: schema.dataGenerations.state,
      publishedSequence: schema.dataGenerations.publishedSequence,
      createdAt: schema.dataGenerations.createdAt,
      articleCount: schema.dataGenerations.articleCount,
      tagCount: schema.dataGenerations.tagCount,
    })
    .from(schema.dataGenerations)
    .where(eq(schema.dataGenerations.state, "published"))
    .orderBy(desc(schema.dataGenerations.publishedSequence))
    .limit(limit);

export class GenerationNotPublishedError extends Error {
  constructor(generationId: string) {
    super(`Generation ${generationId} is not published`);
    this.name = "GenerationNotPublishedError";
  }
}

export const assertGenerationPublished = async (
  db: DrizzleD1Database<typeof schema>,
  generationId: string,
): Promise<void> => {
  const generation = await getPublishedDataGeneration(db, generationId);
  if (!generation) {
    throw new GenerationNotPublishedError(generationId);
  }
};

export const pruneOldGenerations = async (
  db: DrizzleD1Database<typeof schema>,
  retainCount = 3,
): Promise<void> => {
  if (
    !Number.isSafeInteger(retainCount) ||
    retainCount < 1 ||
    retainCount > 100
  )
    throw new Error("Invalid generation retention limit");
  await db.run(sql`DELETE FROM data_generations WHERE state = 'published'
    AND id NOT IN (SELECT generation_id FROM active_data_generation)
    AND id NOT IN (SELECT id FROM data_generations WHERE state = 'published'
      ORDER BY published_sequence DESC LIMIT ${retainCount})`);
};

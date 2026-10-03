import {
  GenerationNotPublishedError,
  getActiveDataGeneration,
  getPublishedDataGeneration,
  schema,
} from "@/db";
import { drizzle, type DrizzleD1Database } from "@/lib";
import type { Context } from "hono";
import type { Env } from "./factory";

type SnapshotHandler = (
  db: DrizzleD1Database<typeof schema>,
  dataVersion: string,
  publishedSequence: number,
) => Promise<Response>;

const generationError = (
  c: Context<Env>,
  status: 409 | 503,
  currentVersion?: string,
) => {
  const headers = currentVersion
    ? { "X-Data-Version": currentVersion }
    : undefined;
  return c.json(
    {
      title:
        status === 409
          ? "Data generation unavailable"
          : "No published data generation",
      status,
    },
    status,
    headers,
  );
};

export const withDataVersion = async (
  c: Context<Env>,
  handler: SnapshotHandler,
): Promise<Response> => {
  const session = c.env.DB.withSession("first-primary");
  const db = drizzle(session as unknown as D1Database, { schema });
  const active = await getActiveDataGeneration(db);
  if (active?.state !== "published") {
    return generationError(c, 503);
  }

  const expectedVersion = c.req.header("X-Expected-Data-Version");
  const selected =
    expectedVersion === undefined
      ? active
      : await getPublishedDataGeneration(db, expectedVersion);
  if (!selected) {
    return generationError(c, 409, active.id);
  }

  c.header("X-Data-Version", selected.id);
  let response: Response;
  try {
    response = await handler(db, selected.id, selected.publishedSequence ?? 0);
  } catch (error) {
    if (!(error instanceof GenerationNotPublishedError)) throw error;
    const latest = await getActiveDataGeneration(db);
    return generationError(c, latest?.id ? 409 : 503, latest?.id);
  }
  const stillPublished = await getPublishedDataGeneration(db, selected.id);
  if (!stillPublished) {
    const latest = await getActiveDataGeneration(db);
    return generationError(c, latest?.id ? 409 : 503, latest?.id);
  }
  return response;
};

export const getCurrentDataVersion = async (
  db: DrizzleD1Database<typeof schema>,
): Promise<string | null> => {
  const active = await getActiveDataGeneration(db);
  return active?.state === "published" ? active.id : null;
};

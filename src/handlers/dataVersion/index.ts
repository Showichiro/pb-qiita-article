import { getActiveDataGeneration, listRetainedDataGenerations } from "@/db";
import type { DataVersionResponse, DataVersionsResponse } from "@/schemas";
import type { Env } from "@/util";
import type { Handler } from "hono";

export const dataVersionHandler: Handler<Env, "/api/data-version"> = async (c) => {
  const activeGeneration = await getActiveDataGeneration(c.var.db);

  if (!activeGeneration) {
    return c.json(
      { error: "No active data generation" },
      503,
    );
  }

  if (activeGeneration.state !== "published") {
    return c.json(
      { error: "Active generation is not published" },
      503,
    );
  }

  const response: DataVersionResponse = {
    dataVersion: activeGeneration.id,
    publishedSequence: activeGeneration.publishedSequence ?? 0,
    publishedAt: activeGeneration.createdAt,
    articleCount: activeGeneration.articleCount ?? 0,
    tagCount: activeGeneration.tagCount ?? 0,
  };

  c.header("X-Data-Version", activeGeneration.id);
  c.header("Cache-Control", "no-store");

  return c.json(response);
};

export const dataVersionsHandler: Handler<Env, "/api/data-versions"> = async (c) => {
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10), 1), 10) : 3;

  const generations = await listRetainedDataGenerations(c.var.db, limit);

  const response: DataVersionsResponse = {
    versions: generations.map((gen) => ({
      id: gen.id,
      publishedSequence: gen.publishedSequence ?? 0,
      publishedAt: gen.createdAt,
      articleCount: gen.articleCount ?? 0,
      tagCount: gen.tagCount ?? 0,
    })),
  };

  return c.json(response);
};

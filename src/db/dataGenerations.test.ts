import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { drizzle } from "@/lib";
import * as schema from "./schema";
import {
  getActiveDataGeneration,
  getPublishedDataGeneration,
  listRetainedDataGenerations,
  assertGenerationPublished,
  GenerationNotPublishedError,
  pruneOldGenerations,
} from "./dataGenerations";

describe("dataGenerations", () => {
  let runtime: Miniflare;
  const createRuntime = () =>
    new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: ["DB"],
    });
  let DB: D1Database;
  let db: import("@/lib").DrizzleD1Database<typeof schema>;

  beforeEach(async () => {
    runtime = createRuntime();
    DB = await runtime.getD1Database("DB");
    db = drizzle(DB, { schema });
    // Apply schema
    const schemaSql = `
      CREATE TABLE data_generations (
        id text PRIMARY KEY NOT NULL,
        state text NOT NULL,
        owner_id text,
        based_on_generation_id text,
        created_at text NOT NULL,
        manifest_digest text,
        article_count integer,
        tag_count integer,
        published_sequence integer
      );
      CREATE TABLE active_data_generation (
        singleton integer PRIMARY KEY NOT NULL,
        generation_id text NOT NULL,
        published_sequence integer NOT NULL
      );
    `;
    for (const statement of schemaSql.split(";")) {
      if (statement.trim()) {
        await DB.prepare(statement.trim()).run();
      }
    }
  });

  afterEach(() => runtime.dispose());

  describe("getActiveDataGeneration", () => {
    it("returns null when no active generation exists", async () => {
      const result = await getActiveDataGeneration(db);
      expect(result).toBeNull();
    });

    it("returns the active generation when set", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1)
        .run();
      await DB.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (?, ?, ?)",
      )
        .bind(1, "gen-1", 1)
        .run();

      const result = await getActiveDataGeneration(db);
      expect(result).toEqual({
        id: "gen-1",
        state: "published",
        publishedSequence: 1,
        createdAt: "2026-10-03T00:00:00Z",
        articleCount: null,
        tagCount: null,
      });
    });

    it("returns null when active generation is not published", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-1", "staging", "2026-10-03T00:00:00Z")
        .run();
      await DB.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (?, ?, ?)",
      )
        .bind(1, "gen-1", 0)
        .run();

      const result = await getActiveDataGeneration(db);
      expect(result).not.toBeNull();
      expect(result?.state).toBe("staging");
    });
  });

  describe("getPublishedDataGeneration", () => {
    it("returns null for non-existent generation", async () => {
      const result = await getPublishedDataGeneration(db, "nonexistent");
      expect(result).toBeNull();
    });

    it("returns null for staging generation", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-1", "staging", "2026-10-03T00:00:00Z")
        .run();

      const result = await getPublishedDataGeneration(db, "gen-1");
      expect(result).toBeNull();
    });

    it("returns published generation", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1)
        .run();

      const result = await getPublishedDataGeneration(db, "gen-1");
      expect(result).toEqual({
        id: "gen-1",
        state: "published",
        publishedSequence: 1,
        createdAt: "2026-10-03T00:00:00Z",
        articleCount: null,
        tagCount: null,
      });
    });
  });

  describe("assertGenerationPublished", () => {
    it("throws for non-existent generation", async () => {
      await expect(
        assertGenerationPublished(db, "nonexistent"),
      ).rejects.toThrow(GenerationNotPublishedError);
    });

    it("throws for staging generation", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-1", "staging", "2026-10-03T00:00:00Z")
        .run();

      await expect(assertGenerationPublished(db, "gen-1")).rejects.toThrow(
        GenerationNotPublishedError,
      );
    });

    it("does not throw for published generation", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1)
        .run();

      await expect(
        assertGenerationPublished(db, "gen-1"),
      ).resolves.not.toThrow();
    });
  });

  describe("listRetainedDataGenerations", () => {
    it("returns empty array when no generations exist", async () => {
      const result = await listRetainedDataGenerations(db);
      expect(result).toEqual([]);
    });

    it("returns only published generations", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1)
        .run();
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-2", "staging", "2026-10-03T00:00:00Z")
        .run();

      const result = await listRetainedDataGenerations(db);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("gen-1");
    });

    it("orders by published_sequence DESC", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1)
        .run();
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-2", "published", "2026-10-04T00:00:00Z", 2)
        .run();

      const result = await listRetainedDataGenerations(db);
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("gen-2");
      expect(result[1]?.id).toBe("gen-1");
    });

    it("respects limit parameter", async () => {
      for (let i = 1; i <= 5; i++) {
        await DB.prepare(
          "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
        )
          .bind(`gen-${i}`, "published", "2026-10-03T00:00:00Z", i)
          .run();
      }

      const result = await listRetainedDataGenerations(db, 3);
      expect(result).toHaveLength(3);
    });
  });

  describe("pruneOldGenerations", () => {
    it("does nothing when fewer than retainCount generations exist", async () => {
      for (let i = 1; i <= 2; i++) {
        await DB.prepare(
          "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
        )
          .bind(`gen-${i}`, "published", "2026-10-03T00:00:00Z", i)
          .run();
      }

      await pruneOldGenerations(db, 3);

      const remaining = await DB.prepare(
        "SELECT COUNT(*) as count FROM data_generations",
      ).first<{ count: number }>();
      expect(remaining?.count).toBe(2);
    });

    it("prunes old generations beyond retainCount", async () => {
      for (let i = 1; i <= 5; i++) {
        await DB.prepare(
          "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
        )
          .bind(`gen-${i}`, "published", "2026-10-03T00:00:00Z", i)
          .run();
      }

      await pruneOldGenerations(db, 3);

      const remaining = await DB.prepare(
        "SELECT COUNT(*) as count FROM data_generations",
      ).first<{ count: number }>();
      expect(remaining?.count).toBe(3);

      const ids = await DB.prepare(
        "SELECT id FROM data_generations ORDER BY published_sequence DESC",
      ).all<{ id: string }>();
      expect(ids.results.map((r) => r.id)).toEqual(["gen-5", "gen-4", "gen-3"]);
    });

    it("does not prune staging generations", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence) VALUES (?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1)
        .run();
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-2", "staging", "2026-10-03T00:00:00Z")
        .run();

      await pruneOldGenerations(db, 1);

      const remaining = await DB.prepare(
        "SELECT COUNT(*) as count FROM data_generations",
      ).first<{ count: number }>();
      expect(remaining?.count).toBe(2); // Both published and staging remain
    });
  });
});

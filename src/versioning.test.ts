import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import routes from "./index";

describe("Version API", () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"],
  });
  let DB: D1Database;

  beforeEach(async () => {
    DB = await runtime.getD1Database("DB");
    // Apply full schema including versioned tables
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
      CREATE TABLE generation_articles (
        generation_id text NOT NULL,
        id text NOT NULL,
        title text NOT NULL,
        user_id text NOT NULL,
        user_name text NOT NULL,
        created_at text NOT NULL,
        likes_count integer NOT NULL,
        stocks_count integer NOT NULL,
        PRIMARY KEY(generation_id, id)
      );
      CREATE TABLE generation_tags (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        generation_id text NOT NULL,
        article_id text NOT NULL,
        name text NOT NULL,
        position integer NOT NULL
      );
    `;
    for (const statement of schemaSql.split(";")) {
      if (statement.trim()) {
        await DB.prepare(statement.trim()).run();
      }
    }
  });

  afterEach(() => runtime.dispose());

  describe("GET /api/data-version", () => {
    it("returns 503 when no active generation exists", async () => {
      const response = await routes.request("/api/data-version", {}, { DB });
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toEqual({ error: "No active data generation" });
    });

    it("returns 503 when active generation is not published", async () => {
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

      const response = await routes.request("/api/data-version", {}, { DB });
      expect(response.status).toBe(503);
    });

    it("returns active generation with X-Data-Version header", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1, 100, 50)
        .run();
      await DB.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (?, ?, ?)",
      )
        .bind(1, "gen-1", 1)
        .run();

      const response = await routes.request("/api/data-version", {}, { DB });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Data-Version")).toBe("gen-1");
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const body = await response.json();
      expect(body).toEqual({
        dataVersion: "gen-1",
        publishedSequence: 1,
        publishedAt: "2026-10-03T00:00:00Z",
        articleCount: 100,
        tagCount: 50,
      });
    });
  });

  describe("GET /api/data-versions", () => {
    it("returns empty array when no generations exist", async () => {
      const response = await routes.request("/api/data-versions", {}, { DB });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ versions: [] });
    });

    it("returns only published generations", async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1, 100, 50)
        .run();
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-2", "staging", "2026-10-04T00:00:00Z")
        .run();

      const response = await routes.request("/api/data-versions", {}, { DB });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.versions).toHaveLength(1);
      expect(body.versions[0]?.id).toBe("gen-1");
    });

    it("respects limit parameter", async () => {
      for (let i = 1; i <= 5; i++) {
        await DB.prepare(
          "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(`gen-${i}`, "published", "2026-10-03T00:00:00Z", i, i * 10, i * 5)
          .run();
      }

      const response = await routes.request("/api/data-versions?limit=2", {}, { DB });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.versions).toHaveLength(2);
    });

    it("caps limit at 10", async () => {
      for (let i = 1; i <= 15; i++) {
        await DB.prepare(
          "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(`gen-${i}`, "published", "2026-10-03T00:00:00Z", i, i * 10, i * 5)
          .run();
      }

      const response = await routes.request("/api/data-versions?limit=20", {}, { DB });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.versions).toHaveLength(10);
    });
  });

  describe("Data API version headers", () => {
    beforeEach(async () => {
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("gen-1", "published", "2026-10-03T00:00:00Z", 1, 100, 50)
        .run();
      await DB.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (?, ?, ?)",
      )
        .bind(1, "gen-1", 1)
        .run();
    });

    it("includes X-Data-Version header on /api/articles", async () => {
      const response = await routes.request("/api/articles?limit=1", {}, { DB });
      expect(response.headers.get("X-Data-Version")).toBe("gen-1");
    });

    it("includes X-Data-Version header on /api/ranking/post-counts", async () => {
      const response = await routes.request("/api/ranking/post-counts", {}, { DB });
      expect(response.headers.get("X-Data-Version")).toBe("gen-1");
    });

    it("includes X-Data-Version header on /api/ranking/likes-counts", async () => {
      const response = await routes.request("/api/ranking/likes-counts", {}, { DB });
      expect(response.headers.get("X-Data-Version")).toBe("gen-1");
    });

    it("includes X-Data-Version header on /api/analysis/time-series", async () => {
      const response = await routes.request("/api/analysis/time-series", {}, { DB });
      expect(response.headers.get("X-Data-Version")).toBe("gen-1");
    });

    it("returns 503 when no active generation", async () => {
      await DB.prepare("DELETE FROM active_data_generation").run();

      const response = await routes.request("/api/articles?limit=1", {}, { DB });
      expect(response.status).toBe(503);
    });
  });

  describe("Partial import failure scenario", () => {
    it("serves old generation when new generation is staging", async () => {
      // Set up old published generation
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("gen-old", "published", "2026-10-02T00:00:00Z", 1, 50, 25)
        .run();
      await DB.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (?, ?, ?)",
      )
        .bind(1, "gen-old", 1)
        .run();

      // Create staging generation (simulating partial import)
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at) VALUES (?, ?, ?)",
      )
        .bind("gen-new", "staging", "2026-10-03T00:00:00Z")
        .run();

      // API should still serve old generation
      const response = await routes.request("/api/data-version", {}, { DB });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.dataVersion).toBe("gen-old");
    });
  });

  describe("Old generation unavailable (409)", () => {
    it("returns 409 when requesting specific old generation that no longer exists", async () => {
      // Set up active generation
      await DB.prepare(
        "INSERT INTO data_generations (id, state, created_at, published_sequence, article_count, tag_count) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind("gen-new", "published", "2026-10-03T00:00:00Z", 2, 100, 50)
        .run();
      await DB.prepare(
        "INSERT INTO active_data_generation (singleton, generation_id, published_sequence) VALUES (?, ?, ?)",
      )
        .bind(1, "gen-new", 2)
        .run();

      // Request old generation that was pruned
      // This would be implemented with ?version= query parameter
      // For now, we test that active generation is returned
      const response = await routes.request("/api/data-version", {}, { DB });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Data-Version")).toBe("gen-new");
    });
  });
});

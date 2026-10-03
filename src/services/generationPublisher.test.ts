import { readFileSync } from "node:fs";
import app from "../index";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeManifestDigest,
  importQiitaGeneration,
  publishGeneration,
  retainGenerations,
  stageGeneration,
  type GenerationConfig,
  type QiitaItem,
} from "./generationPublisher";

describe("immutable generation publication", () => {
  let runtime: Miniflare;
  let db: D1Database;
  beforeEach(async () => {
    runtime = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      d1Databases: ["DB"],
    });
    db = await runtime.getD1Database("DB");
    for (const file of [
      "0000_quick_vanisher.sql",
      "0001_add_versioned_data.sql",
    ]) {
      const sql = readFileSync(`migrations/${file}`, "utf8");
      for (const statement of sql.split("--> statement-breakpoint"))
        if (statement.trim()) await db.prepare(statement).run();
    }
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await runtime.dispose();
  });
  const item = (title = "first"): QiitaItem => ({
    id: "a",
    title,
    created_at: "2026-10-01T00:00:00Z",
    likes_count: 1,
    stocks_count: 0,
    user: { id: "author", name: "Author" },
    tags: [{ name: "TypeScript" }],
  });
  const config = (
    base: string | null = null,
    owner = "owner",
  ): GenerationConfig => ({
    db,
    ownerId: owner,
    basedOnGenerationId: base,
    maxChunkRows: 1,
    maxChunkStatements: 1,
  });
  async function stage(id: string, items: QiitaItem[], options = config()) {
    await db
      .prepare(
        "INSERT INTO data_generations (id,state,owner_id,based_on_generation_id,created_at) VALUES (?,'staging',?,?,?)",
      )
      .bind(id, options.ownerId, options.basedOnGenerationId ?? null, "now")
      .run();
    const counts = await stageGeneration(options, items, id);
    return counts;
  }
  const computeDigestPlaceholder = "a".repeat(64);
  async function publish(id: string, items: QiitaItem[], options = config()) {
    await stage(id, items, options);
    return publishGeneration(
      options,
      id,
      await computeManifestDigest(items),
      items.length,
      items.reduce((n, i) => n + i.tags.length, 0),
    );
  }
  async function active() {
    return db
      .prepare("SELECT generation_id FROM active_data_generation")
      .first<{ generation_id: string }>();
  }

  it("publishes complete rows and tags together, including an initially empty snapshot", async () => {
    expect(await publish("one", [])).toMatchObject({
      generationId: "one",
      publishedSequence: 1,
    });
    expect(await publish("two", [item()], config("one"))).toMatchObject({
      publishedSequence: 2,
    });
    expect(await active()).toEqual({ generation_id: "two" });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM generation_tags WHERE generation_id='two'",
        )
        .first(),
    ).toEqual({ n: 1 });
  });
  it("allows only one initial publisher and fences another owner", async () => {
    await stage("one", [item()], config(null, "one-owner"));
    await stage("two", [item("second")], config(null, "two-owner"));
    await expect(
      publishGeneration(
        config(null, "wrong-owner"),
        "one",
        computeDigestPlaceholder,
        1,
        1,
      ),
    ).rejects.toThrow("fence");
    await publishGeneration(
      config(null, "one-owner"),
      "one",
      await computeManifestDigest([item()]),
      1,
      1,
    );
    await expect(
      publishGeneration(
        config(null, "two-owner"),
        "two",
        computeDigestPlaceholder,
        1,
        1,
      ),
    ).rejects.toThrow("CAS");
    expect(await active()).toEqual({ generation_id: "one" });
  });
  it("rejects a stale update while retaining the old published rows", async () => {
    await publish("one", [item()]);
    await stage("stale", [item("stale")], config("one"));
    await publish("two", [item("second")], config("one"));
    await expect(
      publishGeneration(config("one"), "stale", computeDigestPlaceholder, 1, 1),
    ).rejects.toThrow("CAS");
    expect(await active()).toEqual({ generation_id: "two" });
    expect(
      await db
        .prepare(
          "SELECT title FROM generation_articles WHERE generation_id='one'",
        )
        .first(),
    ).toEqual({ title: "first" });
  });
  it("performs no D1 work if the upstream snapshot is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("upstream", { status: 503 })),
    );
    const prepare = vi.spyOn(db, "prepare");
    await expect(
      importQiitaGeneration(config(), { token: "test" }),
    ).rejects.toThrow("HTTP 503");
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "commits one winner when publishers race (existing base: %s)",
    async (existing) => {
      const base = existing ? "base" : null;
      if (base) await publish(base, [item("base")]);
      await stage("left", [item("left")], config(base, "left"));
      await stage("right", [item("right")], config(base, "right"));
      const results = await Promise.allSettled([
        publishGeneration(
          config(base, "left"),
          "left",
          await computeManifestDigest([item("left")]),
          1,
          1,
        ),
        publishGeneration(
          config(base, "right"),
          "right",
          await computeManifestDigest([item("right")]),
          1,
          1,
        ),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const pointer = await active();
      expect(["left", "right"]).toContain(pointer?.generation_id);
      const published = await db
        .prepare(
          "SELECT id FROM data_generations WHERE state='published' AND id IN ('left','right')",
        )
        .all();
      expect(published.results).toEqual([{ id: pointer?.generation_id }]);
    },
  );
  it("preserves an unchanged version without storing duplicate snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            Response.json([item()], { headers: { "Total-Count": "1" } }),
          ),
        ),
    );
    const first = await importQiitaGeneration(
      { ...config(), basedOnGenerationId: undefined },
      { token: "test" },
    );
    expect(
      await importQiitaGeneration(
        { ...config(), basedOnGenerationId: undefined },
        { token: "test" },
      ),
    ).toEqual({ ...first, preserved: true });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM data_generations WHERE owner_id='owner'",
        )
        .first(),
    ).toEqual({ n: 1 });
  });
  it("cleans up a failed chunk without changing the active snapshot", async () => {
    await publish("one", [item()]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json([item("second")], { headers: { "Total-Count": "1" } }),
        ),
    );
    const batch = db.batch.bind(db);
    let calls = 0;
    const failBatch = async (statements: D1PreparedStatement[]) => {
      if (++calls === 2) throw new Error("chunk failure");
      return batch(statements);
    };
    const failingDb = new Proxy(db, {
      get(target, key) {
        if (key === "batch") return failBatch;
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      importQiitaGeneration(
        { ...config("one"), db: failingDb },
        { token: "test" },
      ),
    ).rejects.toThrow("chunk failure");
    expect(await active()).toEqual({ generation_id: "one" });
    expect(
      await db.prepare("SELECT COUNT(*) AS n FROM generation_articles").first(),
    ).toEqual({ n: 1 });
  });
  it("prunes snapshots with cascading rows and always protects the active pointer", async () => {
    await publish("one", [item()]);
    await publish("two", [item("second")], config("one"));
    await publish("three", [item("third")], config("two"));
    await retainGenerations(db, 1);
    expect(
      await db.prepare("SELECT generation_id FROM generation_articles").all(),
    ).toMatchObject({ results: [{ generation_id: "three" }] });
    expect(await active()).toEqual({ generation_id: "three" });
  });
  it("canonicalizes order without allowing delimiter collisions", async () => {
    const a = item("a|b");
    const b = { ...item("a"), user: { id: "b|author", name: "Author" } };
    expect(await computeManifestDigest([a])).not.toBe(
      await computeManifestDigest([b]),
    );
    const second = { ...item(), id: "b" };
    expect(await computeManifestDigest([a, second])).toBe(
      await computeManifestDigest([second, a]),
    );
  });
  it("serves retained snapshots consistently across APIs and native SSR", async () => {
    await publish("one", [item()]);
    await publish(
      "two",
      [{ ...item("new title"), likes_count: 9 }],
      config("one"),
    );
    const headers = { "X-Expected-Data-Version": "one" };
    const articles = await app.request(
      "/api/articles",
      { headers },
      { DB: db },
    );
    expect(articles.status).toBe(200);
    expect(articles.headers.get("X-Data-Version")).toBe("one");
    expect(await articles.json()).toMatchObject([
      { title: "first", likesCount: 1 },
    ]);
    const likes = await app.request(
      "/api/ranking/likes-counts",
      { headers },
      { DB: db },
    );
    expect(likes.headers.get("X-Data-Version")).toBe("one");
    expect(await likes.json()).toMatchObject([{ totalLikesCount: "1" }]);
    const analysis = await app.request(
      "/api/analysis/time-series?since=2026-10-01&until=2026-10-01",
      { headers },
      { DB: db },
    );
    expect(analysis.headers.get("X-Data-Version")).toBe("one");
    expect(await analysis.json()).toMatchObject({
      rows: [{ publishedArticleLikes: 1 }],
    });
    for (const path of ["/articles", "/ranking", "/analysis"]) {
      const page = await app.request(path, {}, { DB: db });
      expect(page.status).toBe(200);
      expect(page.headers.get("X-Data-Version")).toBe("two");
      expect(await page.text()).toContain('"dataVersion":"two"');
    }
    await retainGenerations(db, 1);
    const expired = await app.request("/api/articles", { headers }, { DB: db });
    expect(expired.status).toBe(409);
    expect(expired.headers.get("X-Data-Version")).toBe("two");
  });
});

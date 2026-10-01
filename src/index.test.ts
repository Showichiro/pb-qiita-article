import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import app from "./index";

describe("Workers application", () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"],
  });
  let DB: D1Database;

  beforeAll(async () => {
    DB = await runtime.getD1Database("DB");
    const sql = await readFile("migrations/0000_quick_vanisher.sql", "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      await DB.prepare(statement.trim()).run();
    }
  });
  afterAll(() => runtime.dispose());

  test("redirects the root to articles", async () => {
    const response = await app.request("/", {}, { DB });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/articles");
  });

  test("serves the article API against D1", async () => {
    const response = await app.request("/api/articles?limit=1", {}, { DB });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test.each([
    "limit=invalid",
    "limit=101",
    "since=invalid",
    "orderField=invalid",
  ])("preserves formatted validation errors for %s", async (query) => {
    const response = await app.request(`/api/articles?${query}`, {}, { DB });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      title: "Bad Request",
      detail: { _errors: [] },
      status: 400,
    });
  });

  test("publishes OpenAPI with a deployment-relative server", async () => {
    const response = await app.request("/doc", {}, { DB });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      servers: expect.arrayContaining([
        { url: "/", description: "Current deployment" },
      ]),
      paths: { "/api/articles": expect.any(Object) },
    });
  });
});

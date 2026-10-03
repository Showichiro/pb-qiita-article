import {
  migrateTestGeneration,
  refreshTestGeneration,
} from "@/db/test-generation";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import app from "@/index";

describe("ranking SSR handler against local D1", () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"],
  });
  let DB: D1Database;
  const ids = ["sho110-chart-a", "sho110-chart-b", "sho110-chart-c"];

  beforeAll(async () => {
    DB = await runtime.getD1Database("DB");
    const migration = await readFile(
      "migrations/0000_quick_vanisher.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await DB.prepare(statement.trim()).run();
    await migrateTestGeneration(DB);
  });

  afterEach(async () => {
    for (const id of ids)
      await DB.prepare("DELETE FROM articles WHERE id = ?").bind(id).run();
  });

  afterAll(() => runtime.dispose());

  it("renders query-selected native controls, bounded rows, chart space, and escaped bootstrap data", async () => {
    await DB.prepare(
      "INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        ids[0],
        "A post",
        "writer-a",
        "</script><img src=x onerror=alert(1)>",
        "2026-01-01T00:00:00.000Z",
        12,
        1,
        ids[1],
        "Another post",
        "writer-a",
        "</script><img src=x onerror=alert(1)>",
        "2026-01-02T00:00:00.000Z",
        8,
        0,
        ids[2],
        "Third post",
        "writer-b",
        "Writer B",
        "2026-01-03T00:00:00.000Z",
        5,
        2,
      )
      .run();

    await refreshTestGeneration(DB);
    await DB.prepare(
      "INSERT OR IGNORE INTO active_data_generation VALUES (1,'legacy',1)",
    ).run();
    const response = await app.request(
      "/ranking?since=2026-01-01&until=2026-01-04&view=chart&topN=1",
      {},
      { DB },
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('action="/ranking"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="view"');
    expect(html).toContain('value="chart"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('data-ranking-action=""');
    expect(html).toContain('class="');
    expect(html).toContain("h-9 w-28");
    expect(html).toContain("検索する");
    expect(html).toContain('name="topN"');
    expect(html).toContain('value="1"');
    expect(html.match(/h-\[320px\]/g)).toHaveLength(2);
    expect(html.match(/<tbody/g)).toHaveLength(2);
    expect(html.match(/data-slot="table-row"/g)).toHaveLength(4);
    expect(html).toContain("期間内に公開された記事の現在の合計いいね数です。");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");

    const bootstrapStart = html.indexOf(
      '<script id="ranking-bootstrap" type="application/json">',
    );
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    const jsonStart = html.indexOf(">", bootstrapStart) + 1;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    const bootstrap = JSON.parse(html.slice(jsonStart, jsonEnd)) as {
      config: { since: string; until: string; view: string; topN: number };
      postCounts: Array<{ userId: string; userName: string; count: number }>;
      likesCounts: Array<{
        userId: string;
        userName: string;
        totalLikesCount: string | null;
      }>;
    };
    expect(bootstrap.config).toEqual({
      since: "2026-01-01",
      until: "2026-01-04",
      view: "chart",
      topN: 1,
    });
    expect(bootstrap.postCounts).toEqual([
      {
        userId: "writer-a",
        userName: "</script><img src=x onerror=alert(1)>",
        count: 2,
      },
      { userId: "writer-b", userName: "Writer B", count: 1 },
    ]);
    expect(bootstrap.likesCounts[0].totalLikesCount).toBe("20");
    expect(html).toContain("writer-a");
  });

  it("retains the legacy date-only page defaults and nullable likes contract", async () => {
    await refreshTestGeneration(DB);
    await DB.prepare(
      "INSERT OR IGNORE INTO active_data_generation VALUES (1,'legacy',1)",
    ).run();
    const response = await app.request("/ranking?since=&until=", {}, { DB });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="view"');
    expect(html).toContain('value="table"');
    expect(html).toContain('name="topN"');
    expect(html).toContain('value="10"');
    expect(html).not.toContain("h-[320px]");
    expect(html).toContain("該当するデータはありません");
  });
});

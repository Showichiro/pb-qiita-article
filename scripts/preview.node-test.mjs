import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";
import cloudflareConfig from "../cloudflare.config.ts";
import {
  ensurePreviewDatabase,
  ensurePreviewFixture,
  ensurePreviewGeneration,
  PREVIEW_DATABASE_NAME,
  PREVIEW_MARKER_TABLE,
  PREVIEW_SEED_VERSION,
} from "./preview-db.mjs";
import {
  PRODUCTION_D1_ID,
  selectDatabaseId,
} from "./preview-config.mjs";
import { publishPreviewComment } from "./comment-preview.mjs";
import { parseDeployment, publishPreview } from "./publish-preview.mjs";

const PREVIEW_D1_ID = "1d501637-c2ae-4379-92ec-ab7fb15c0651";
const OTHER_D1_ID = "8c4b3225-50e1-4df4-8a49-e18a0d941eb2";

test("preview binding requires a valid nonproduction UUID and leaves production unchanged", async () => {
  assert.equal(selectDatabaseId(false, undefined), PRODUCTION_D1_ID);
  assert.equal(selectDatabaseId(true, PREVIEW_D1_ID), PREVIEW_D1_ID);
  assert.throws(() => selectDatabaseId(true, undefined), /required for Worker Previews/);
  assert.throws(() => selectDatabaseId(true, "not-a-uuid"), /required for Worker Previews/);
  assert.throws(() => selectDatabaseId(true, PRODUCTION_D1_ID), /must not use the production database/);

  const previous = process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID;
  process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID = PREVIEW_D1_ID;
  try {
    const previewConfig = await cloudflareConfig({
      isPreview: true,
      mode: "production",
    });
    const productionConfig = await cloudflareConfig({
      isPreview: false,
      mode: "production",
    });
    assert.equal(previewConfig.worker.env.DB.id, PREVIEW_D1_ID);
    assert.equal(productionConfig.worker.env.DB.id, PRODUCTION_D1_ID);
    assert.equal(productionConfig.worker.entrypoint, "./src/worker.ts");
    assert.ok(productionConfig.worker.triggers);
    assert.equal(productionConfig.worker.triggers.length, 1);
    assert.equal(productionConfig.worker.triggers[0].schedule, "0 15 * * *");
    assert.ok(!previewConfig.worker.triggers || previewConfig.worker.triggers.length === 0);
    delete process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID;
    assert.throws(
      () => cloudflareConfig({ isPreview: true, mode: "production" }),
      /required for Worker Previews/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID;
    } else {
      process.env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID = previous;
    }
  }
});

test("preview D1 is found by exact name or created once; unsafe IDs fail closed", async () => {
  const env = {
    CLOUDFLARE_API_TOKEN: "mock-token",
    CLOUDFLARE_ACCOUNT_ID: "mock-account",
  };
  const reusedCalls = [];
  const reused = await ensurePreviewDatabase(
    async (args) => {
      reusedCalls.push(args);
      return {
        result: [{ name: PREVIEW_DATABASE_NAME, uuid: PREVIEW_D1_ID }],
      };
    },
    env,
  );
  assert.equal(reused, PREVIEW_D1_ID);
  assert.equal(reusedCalls.length, 1);
  assert.deepEqual(reusedCalls[0].slice(0, 4), [
    "d1",
    "list",
    "--name",
    PREVIEW_DATABASE_NAME,
  ]);

  const createdCalls = [];
  const created = await ensurePreviewDatabase(
    async (args) => {
      createdCalls.push(args);
      if (args[1] === "list") return { result: [] };
      return {
        result: { name: PREVIEW_DATABASE_NAME, uuid: OTHER_D1_ID },
      };
    },
    env,
  );
  assert.equal(created, OTHER_D1_ID);
  assert.equal(createdCalls[1][1], "create");

  await assert.rejects(
    ensurePreviewDatabase(
      async () => ({
        result: [{ name: PREVIEW_DATABASE_NAME, uuid: PRODUCTION_D1_ID }],
      }),
      env,
    ),
    /must not use the production database/,
  );
  await assert.rejects(
    ensurePreviewDatabase(async () => assert.fail("must not call cf"), {}),
    /CLOUDFLARE_API_TOKEN is required/,
  );
  await assert.rejects(
    ensurePreviewDatabase(async () => assert.fail("must not call cf"), {
      CLOUDFLARE_API_TOKEN: "mock-token",
    }),
    /CLOUDFLARE_ACCOUNT_ID is required/,
  );
});

test("D1 create races reuse the exact-name winner and permission errors remain visible", async () => {
  const env = {
    CLOUDFLARE_API_TOKEN: "mock-token",
    CLOUDFLARE_ACCOUNT_ID: "mock-account",
  };
  let lookupCount = 0;
  const raced = await ensurePreviewDatabase(
    async (args) => {
      if (args[1] === "list") {
        lookupCount += 1;
        return {
          result:
            lookupCount === 1
              ? []
              : [{ name: PREVIEW_DATABASE_NAME, uuid: PREVIEW_D1_ID }],
        };
      }
      throw new Error("database already exists");
    },
    env,
  );
  assert.equal(raced, PREVIEW_D1_ID);
  await assert.rejects(
    ensurePreviewDatabase(async () => {
      throw new Error("permission denied");
    }, env),
    /permission denied/,
  );
});

test("fixture seed is one bounded batch and Miniflare serves meaningful synthetic queries", async () => {
  const runtime = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: `export default { fetch() { return new Response("ok"); } };`,
  });
  try {
    const db = await runtime.getD1Database("DB");
    const runCf = async (args) => {
      assert.equal(args[0], "d1");
      assert.equal(args[1], "raw");
      assert.equal(args[2], PREVIEW_D1_ID);

      if (args[3] === "--sql") {
        const result = await db.prepare(args[4]).all();
        const columns = Object.keys(result.results[0] ?? {});
        return {
          success: true,
          result: [
            {
              results: {
                columns,
                rows: result.results.map((row) =>
                  columns.map((column) => row[column]),
                ),
              },
              success: true,
            },
          ],
        };
      }
      assert.equal(args[3], "--batch");
      const batchPath = args[4].slice(1);
      const statements = JSON.parse(readFileSync(batchPath, "utf8"));
      assert.ok(statements.length <= 40);
      const results = await db.batch(
        statements.map(({ sql }) => db.prepare(sql)),
      );
      return [{ results }];
    };

    assert.equal(
      await ensurePreviewFixture(PREVIEW_D1_ID, runCf),
      "seeded",
    );
    const counts = await db
      .prepare("SELECT (SELECT count(*) FROM articles) AS articles, (SELECT count(*) FROM tags) AS tags")
      .first();
    assert.deepEqual(counts, { articles: 8, tags: 16 });
    await ensurePreviewGeneration(PREVIEW_D1_ID, runCf);
    await ensurePreviewGeneration(PREVIEW_D1_ID, runCf);
    assert.deepEqual(await db.prepare("SELECT generation_id FROM active_data_generation").first(), {generation_id: "legacy"});
    assert.deepEqual(await db.prepare("SELECT count(*) AS n FROM generation_articles WHERE generation_id='legacy'").first(), {n: 8});

    const filtered = await db
      .prepare(
        "SELECT articles.id FROM articles WHERE instr(lower(articles.title), lower(?)) > 0 AND EXISTS (SELECT 1 FROM tags WHERE tags.article_id = articles.id AND tags.name = ?) ORDER BY articles.likes_count DESC LIMIT ?",
      )
      .bind("react", "react", 10)
      .all();
    assert.deepEqual(filtered.results, [{ id: "preview-fixture-05" }]);

    const analysis = await db
      .prepare(
        "SELECT substr(created_at, 1, 10) AS bucketStart, count(*) AS articleCount FROM articles WHERE created_at >= ? AND created_at < ? GROUP BY bucketStart ORDER BY bucketStart",
      )
      .bind("2026-07-06", "2026-10-04")
      .all();
    assert.equal(analysis.results.length, 8);
    assert.equal(
      analysis.results.reduce((total, row) => total + row.articleCount, 0),
      8,
    );

    const ranking = await db
      .prepare(
        "SELECT user_name, sum(likes_count) AS totalLikes FROM articles GROUP BY user_id ORDER BY totalLikes DESC LIMIT ?",
      )
      .bind(1)
      .first();
    assert.deepEqual(ranking, { user_name: "Aoi Example", totalLikes: 33 });

    await db
      .prepare("UPDATE articles SET title = ? WHERE id = ?")
      .bind("Reviewer edit", "preview-fixture-05")
      .run();
    assert.equal(
      await ensurePreviewFixture(PREVIEW_D1_ID, runCf),
      "already-seeded",
    );
    const unchanged = await db
      .prepare("SELECT title FROM articles WHERE id = ?")
      .bind("preview-fixture-05")
      .first();
    assert.deepEqual(unchanged, { title: "Reviewer edit" });

    const marker = await db
      .prepare(
        `SELECT version FROM "${PREVIEW_MARKER_TABLE}" WHERE "key" = 'fixture'`,
      )
      .first();
    assert.deepEqual(marker, { version: PREVIEW_SEED_VERSION });
  } finally {
    await runtime.dispose();
  }
});

test("an unmarked nonempty preview DB is not seeded or overwritten", async () => {
  const runtime = new Miniflare({
    modules: true,
    d1Databases: ["DB"],
    script: `export default { fetch() { return new Response("ok"); } };`,
  });
  try {
    const db = await runtime.getD1Database("DB");
    await db.exec("CREATE TABLE existing_runtime_data (value TEXT)");
    const runCf = async (args) => {
      if (args[3] !== "--sql") assert.fail("must not seed unmarked data");
      const result = await db.prepare(args[4]).all();
      const columns = Object.keys(result.results[0] ?? {});
      return {
        success: true,
        result: [
          {
            results: {
              columns,
              rows: result.results.map((row) =>
                columns.map((column) => row[column]),
              ),
            },
            success: true,
          },
        ],
      };
    };
    await assert.rejects(
      ensurePreviewFixture(PREVIEW_D1_ID, runCf),
      /not empty and has no recognized fixture marker/,
    );
    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .all();
    assert.deepEqual(tables.results, [{ name: "existing_runtime_data" }]);
  } finally {
    await runtime.dispose();
  }
});

test("preview deployment output must include stable and immutable workers.dev URLs", () => {
  assert.deepEqual(
    parseDeployment(
      JSON.stringify({
        type: "preview",
        preview_urls: ["https://pr-430-pb-qiita-articles.example.workers.dev"],
        deployment_urls: [
          "https://abcd1234-pb-qiita-articles.example.workers.dev",
        ],
      }),
    ),
    {
      stableUrl: "https://pr-430-pb-qiita-articles.example.workers.dev",
      deploymentUrl:
        "https://abcd1234-pb-qiita-articles.example.workers.dev",
    },
  );
  assert.throws(
    () =>
      parseDeployment(
        JSON.stringify({
          type: "preview",
          preview_urls: ["https://example.com"],
          deployment_urls: ["https://abcd1234.example.workers.dev"],
        }),
      ),
    /did not return both preview URLs/,
  );
});

test("preview deploy helper captures exact SHA and both URLs in the artifact and summary", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pb-qiita-preview-result-"));
  const previousDirectory = process.cwd();
  const previousOutput = process.env.GITHUB_OUTPUT;
  const previousSummary = process.env.GITHUB_STEP_SUMMARY;
  const outputPath = join(tempDir, "outputs.txt");
  const summaryPath = join(tempDir, "summary.md");
  const headSha = "c".repeat(40);
  try {
    process.chdir(tempDir);
    process.env.GITHUB_OUTPUT = outputPath;
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    const artifact = publishPreview({
      env: {
        PR_NUMBER: "430",
        PR_HEAD_SHA: headSha,
        CLOUDFLARE_PREVIEW_D1_DATABASE_ID: PREVIEW_D1_ID,
      },
      runCommand: (_command, args) => {
        assert.deepEqual(args.slice(1, 5), [
          "previews",
          "deploy",
          "pr-430",
          "--mode",
        ]);
        return JSON.stringify({
          type: "preview",
          preview_urls: [
            "https://pr-430-pb-qiita-articles.example.workers.dev",
          ],
          deployment_urls: [
            "https://abcd1234-pb-qiita-articles.example.workers.dev",
          ],
        });
      },
    });
    assert.equal(artifact.head_sha, headSha);
    assert.equal(artifact.preview_database_id, PREVIEW_D1_ID);
    const stored = JSON.parse(readFileSync("preview-result.json", "utf8"));
    assert.equal(stored.head_sha, headSha);
    assert.equal(
      stored.preview_url,
      "https://pr-430-pb-qiita-articles.example.workers.dev",
    );
    assert.match(readFileSync(outputPath, "utf8"), new RegExp(headSha));
    assert.match(readFileSync(summaryPath, "utf8"), new RegExp(headSha));
    assert.match(readFileSync(summaryPath, "utf8"), /Immutable deployment/);
  } finally {
    process.chdir(previousDirectory);
    if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = previousOutput;
    if (previousSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previousSummary;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("PR comment helper only publishes the job's exact head and updates its prior comment", () => {
  const preview = {
    pull_request: 430,
    head_sha: "a".repeat(40),
    preview_url: "https://pr-430-pb-qiita-articles.example.workers.dev",
    deployment_url: "https://abcd1234-pb-qiita-articles.example.workers.dev",
  };
  const calls = [];
  const createStatus = publishPreviewComment({
    preview,
    repository: "Showichiro/pb-qiita-article",
    expectedPullRequest: "430",
    expectedHeadSha: preview.head_sha,
    runCommand: (args) => {
      calls.push(args);
      return "[]";
    },
  });
  assert.equal(createStatus, "created");
  assert.equal(calls[1][1], "--method");
  assert.equal(calls[1][2], "POST");
  assert.match(calls[1][4], /Exact head/);

  calls.length = 0;
  const updateStatus = publishPreviewComment({
    preview,
    repository: "Showichiro/pb-qiita-article",
    expectedPullRequest: "430",
    expectedHeadSha: preview.head_sha,
    runCommand: (args) => {
      calls.push(args);
      return JSON.stringify([
        [
          {
            id: 123,
            body: "<!-- pb-qiita-worker-preview --> older preview",
          },
        ],
      ]);
    },
  });
  assert.equal(updateStatus, "updated");
  assert.match(calls[1][0], /issues\/comments\/123$/);
  assert.throws(
    () =>
      publishPreviewComment({
        preview,
        repository: "Showichiro/pb-qiita-article",
        expectedPullRequest: "431",
        expectedHeadSha: preview.head_sha,
        runCommand: () => "[]",
      }),
    /does not match the pull request event/,
  );
});

test("exact-head event guard accepts this checkout and rejects a different event SHA", () => {
  const currentHead = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();
  const tempDir = mkdtempSync(join(tmpdir(), "pb-qiita-preview-event-"));
  const eventFile = join(tempDir, "event.json");
  try {
    const event = {
      pull_request: {
        number: 430,
        head: {
          sha: currentHead,
          repo: { full_name: "Showichiro/pb-qiita-article" },
        },
        base: { repo: { full_name: "Showichiro/pb-qiita-article" } },
      },
    };
    writeFileSync(eventFile, JSON.stringify(event));
    const script = fileURLToPath(
      new URL("./check-preview-event.mjs", import.meta.url),
    );
    const run = (sha) =>
      spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: eventFile,
          GITHUB_REPOSITORY: "Showichiro/pb-qiita-article",
          GITHUB_ACTOR: "reviewer",
          PR_NUMBER: "430",
          PR_HEAD_SHA: sha,
        },
      });
    assert.equal(run(currentHead).status, 0);
    assert.notEqual(run("b".repeat(currentHead.length)).status, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

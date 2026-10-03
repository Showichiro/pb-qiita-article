import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PRODUCTION_D1_ID, selectDatabaseId } from "./preview-config.mjs";

export const PREVIEW_DATABASE_NAME = "pb-qiita-preview";
export const PREVIEW_SEED_VERSION = "fixture-v1";
export const PREVIEW_MARKER_TABLE = "_preview_seed_meta";

const FIXTURE_ARTICLES = [
  [
    "preview-fixture-01",
    "A Sample Guide to Edge Caching",
    "preview-user-01",
    "Aoi Example",
    "2026-07-08T09:00:00.000Z",
    18,
    4,
  ],
  [
    "preview-fixture-02",
    "TypeScript Patterns for Small Projects",
    "preview-user-02",
    "Ren Demo",
    "2026-07-22T09:00:00.000Z",
    12,
    3,
  ],
  [
    "preview-fixture-03",
    "Testing SQLite Queries with Fictional Data",
    "preview-user-03",
    "Mina Sample",
    "2026-08-05T09:00:00.000Z",
    9,
    2,
  ],
  [
    "preview-fixture-04",
    "Accessible Charts: a Tiny Example",
    "preview-user-04",
    "Kai Example",
    "2026-08-19T09:00:00.000Z",
    7,
    1,
  ],
  [
    "preview-fixture-05",
    "A Small Search Interface in React",
    "preview-user-01",
    "Aoi Example",
    "2026-09-02T09:00:00.000Z",
    15,
    5,
  ],
  [
    "preview-fixture-06",
    "Synthetic Article Data for UI Reviews",
    "preview-user-05",
    "Sora Demo",
    "2026-09-16T09:00:00.000Z",
    5,
    1,
  ],
  [
    "preview-fixture-07",
    "An Example Time Series with Dates",
    "preview-user-06",
    "Yui Sample",
    "2026-09-28T09:00:00.000Z",
    11,
    2,
  ],
  [
    "preview-fixture-08",
    "Reliable Forms and URL Filters",
    "preview-user-02",
    "Ren Demo",
    "2026-10-02T09:00:00.000Z",
    8,
    1,
  ],
];

const FIXTURE_TAGS = [
  ["preview-fixture-01", "fictional"],
  ["preview-fixture-01", "cloudflare"],
  ["preview-fixture-02", "fictional"],
  ["preview-fixture-02", "typescript"],
  ["preview-fixture-03", "fictional"],
  ["preview-fixture-03", "testing"],
  ["preview-fixture-04", "fictional"],
  ["preview-fixture-04", "accessibility"],
  ["preview-fixture-05", "fictional"],
  ["preview-fixture-05", "react"],
  ["preview-fixture-06", "fictional"],
  ["preview-fixture-06", "preview"],
  ["preview-fixture-07", "fictional"],
  ["preview-fixture-07", "analysis"],
  ["preview-fixture-08", "fictional"],
  ["preview-fixture-08", "search"],
];

const CF_BIN = join(process.cwd(), "node_modules", "cf", "bin", "cf");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redact(text, token) {
  return token ? text.replaceAll(token, "[REDACTED]") : text;
}

export function runCf(args) {
  const result = spawnSync(process.execPath, [CF_BIN, ...args], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redact(
      (result.stderr || result.stdout || "").trim(),
      process.env.CLOUDFLARE_API_TOKEN,
    );
    throw new Error(
      `cf ${args.slice(0, 2).join(" ")} failed with exit code ${result.status ?? "unknown"}${detail ? `: ${detail}` : "."}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `cf ${args.slice(0, 2).join(" ")} returned invalid JSON.`,
      { cause: error },
    );
  }
}

function databaseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  throw new Error("cf d1 list returned an unexpected response.");
}

function databaseFromCreate(payload) {
  const database = payload?.result;
  if (!database || typeof database !== "object") {
    throw new Error("cf d1 create returned an unexpected response.");
  }
  return database;
}

function validateDatabase(database) {
  if (database.name !== PREVIEW_DATABASE_NAME) {
    throw new Error("Cloudflare returned a D1 database with an unexpected name.");
  }
  return selectDatabaseId(true, database.uuid);
}

async function findPreviewDatabase(runCf) {
  const listed = databaseList(
    await runCf([
      "d1",
      "list",
      "--name",
      PREVIEW_DATABASE_NAME,
      "--per-page",
      "100",
    ]),
  ).filter((database) => database.name === PREVIEW_DATABASE_NAME);

  if (listed.length > 1) {
    throw new Error(
      `More than one D1 database is named ${PREVIEW_DATABASE_NAME}; refusing to choose.`,
    );
  }
  return listed[0];
}

export async function ensurePreviewDatabase(
  runCfCommand = runCf,
  env = process.env,
) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN is required to provision preview D1.");
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required to provision preview D1.");
  }

  const existing = await findPreviewDatabase(runCfCommand);
  if (existing) return validateDatabase(existing);

  try {
    return validateDatabase(
      databaseFromCreate(
        await runCfCommand(["d1", "create", "--name", PREVIEW_DATABASE_NAME]),
      ),
    );
  } catch (createError) {
    try {
      const raced = await findPreviewDatabase(runCfCommand);
      if (raced) return validateDatabase(raced);
    } catch (lookupError) {
      throw new AggregateError(
        [createError, lookupError],
        `Could not create or safely locate D1 database ${PREVIEW_DATABASE_NAME}.`,
      );
    }
    throw createError;
  }
}

function rowsFromRaw(payload) {
  const results = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result)
      ? payload.result
      : undefined;
  if (!results || results.length === 0) {
    throw new Error("cf d1 raw returned an unexpected response.");
  }
  const first = results[0]?.results;
  if (Array.isArray(first)) return first;
  if (first && Array.isArray(first.columns) && Array.isArray(first.rows)) {
    return first.rows.map((row) =>
      Object.fromEntries(
        first.columns.map((column, index) => [column, row[index]]),
      ),
    );
  }
  throw new Error("cf d1 raw returned an unexpected response.");
}

async function queryRows(databaseId, sql, runCfCommand) {
  const payload = await runCfCommand([
    "d1",
    "raw",
    databaseId,
    "--sql",
    sql,
  ]);
  return rowsFromRaw(payload);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildSeedBatch(migrationSql) {
  if (FIXTURE_ARTICLES.length > 20 || FIXTURE_TAGS.length > 40) {
    throw new Error("Preview fixture exceeds its configured row bounds.");
  }
  const migrationStatements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (migrationStatements.length !== 2) {
    throw new Error("Expected the existing two-statement D1 schema migration.");
  }

  const markerTable = `CREATE TABLE "${PREVIEW_MARKER_TABLE}" ("key" TEXT PRIMARY KEY NOT NULL, "version" TEXT NOT NULL)`;
  const articleStatements = FIXTURE_ARTICLES.map(
    (row) =>
      `INSERT INTO articles (id, title, user_id, user_name, created_at, likes_count, stocks_count) VALUES (${row.map(sqlString).join(", ")})`,
  );
  const tagStatements = FIXTURE_TAGS.map(
    (row) =>
      `INSERT INTO tags (article_id, name) VALUES (${row.map(sqlString).join(", ")})`,
  );

  return [
    ...migrationStatements,
    markerTable,
    ...articleStatements,
    ...tagStatements,
    `INSERT INTO "${PREVIEW_MARKER_TABLE}" ("key", "version") VALUES ('fixture', '${PREVIEW_SEED_VERSION}')`,
  ];
}

async function readSeedMarker(databaseId, runCfCommand) {
  const tables = await queryRows(
    databaseId,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    runCfCommand,
  );
  if (!tables.some((table) => table.name === PREVIEW_MARKER_TABLE)) {
    return { tables, marker: undefined };
  }

  if (
    !tables.some((table) => table.name === "articles") ||
    !tables.some((table) => table.name === "tags")
  ) {
    throw new Error(
      "Preview D1 fixture marker exists without the article schema.",
    );
  }
  const markers = await queryRows(
    databaseId,
    `SELECT version FROM "${PREVIEW_MARKER_TABLE}" WHERE "key" = 'fixture'`,
    runCfCommand,
  );
  if (markers.length !== 1 || markers[0].version !== PREVIEW_SEED_VERSION) {
    throw new Error("Preview D1 has an unknown or incomplete fixture marker.");
  }
  return { tables, marker: PREVIEW_SEED_VERSION };
}

export async function ensurePreviewFixture(
  databaseId,
  runCfCommand = runCf,
  migrationSql = readFileSync(
    join(process.cwd(), "migrations", "0000_quick_vanisher.sql"),
    "utf8",
  ),
) {
  const safeDatabaseId = selectDatabaseId(true, databaseId);
  const initialState = await readSeedMarker(safeDatabaseId, runCfCommand);
  if (initialState.marker === PREVIEW_SEED_VERSION) return "already-seeded";
  if (initialState.tables.length > 0) {
    throw new Error(
      "Preview D1 is not empty and has no recognized fixture marker; refusing to seed it.",
    );
  }

  const batch = buildSeedBatch(migrationSql).map((sql) => ({ sql }));
  const tempDir = mkdtempSync(join(tmpdir(), "pb-qiita-preview-seed-"));
  try {
    const batchFile = join(tempDir, "seed.json");
    writeFileSync(batchFile, JSON.stringify(batch));
    try {
      await runCfCommand([
        "d1",
        "raw",
        safeDatabaseId,
        "--batch",
        `@${batchFile}`,
      ]);
      return "seeded";
    } catch (seedError) {
      try {
        const finalState = await readSeedMarker(safeDatabaseId, runCfCommand);
        if (finalState.marker === PREVIEW_SEED_VERSION) return "already-seeded";
      } catch (verificationError) {
        throw new AggregateError(
          [seedError, verificationError],
          "Preview D1 fixture batch failed and its final state could not be verified.",
        );
      }
      throw seedError;
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function ensurePreviewGeneration(databaseId, runCfCommand = runCf) {
  const safeId = selectDatabaseId(true, databaseId);
  const state = await readSeedMarker(safeId, runCfCommand);
  if (state.marker !== PREVIEW_SEED_VERSION) throw new Error("Generation migration requires a recognized preview fixture");
  const names = ["data_generations", "active_data_generation", "generation_articles", "generation_tags"];
  const present = names.filter(name => state.tables.some(table => table.name === name));
  if (present.length && present.length !== names.length) throw new Error("Incomplete preview generation schema");
  if (!present.length) {
    const migration = readFileSync(join(process.cwd(), "migrations", "0001_add_versioned_data.sql"), "utf8");
    const batch = migration.split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean).map(sql => ({sql}));
    const tempDir = mkdtempSync(join(tmpdir(), "pb-qiita-preview-generation-"));
    try {
      const batchFile = join(tempDir, "migration.json");
      writeFileSync(batchFile, JSON.stringify(batch));
      try { await runCfCommand(["d1", "raw", safeId, "--batch", `@${batchFile}`]); }
      catch (error) {
        // A concurrent preview may have committed the same atomic migration.
        const final = await readSeedMarker(safeId, runCfCommand);
        if (!names.every(name => final.tables.some(table => table.name === name))) throw error;
      }
    } finally { rmSync(tempDir, {recursive: true, force: true}); }
  }
  const active = await queryRows(safeId,
    "SELECT a.generation_id FROM active_data_generation a JOIN data_generations g ON g.id=a.generation_id WHERE a.singleton=1 AND g.state='published'", runCfCommand);
  if (active.length !== 1) throw new Error("Preview has no published fixture generation");
}

function writeGithubOutputs(values) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  appendFileSync(
    outputFile,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
}

async function main() {
  const databaseId = await ensurePreviewDatabase();
  const seedStatus = await ensurePreviewFixture(databaseId);
  await ensurePreviewGeneration(databaseId);
  writeGithubOutputs({ database_id: databaseId, seed_status: seedStatus });
  process.stdout.write(
    `Preview D1 ready (${databaseId}); fixture ${seedStatus}.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

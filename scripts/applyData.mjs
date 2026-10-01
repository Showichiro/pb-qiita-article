import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const remote = process.argv.includes("--remote");
const database = "06e39e3a-7b73-4aaf-a334-ab3f95804ba5";
const directory = mkdtempSync(join(tmpdir(), "pb-qiita-data-"));
try {
  // Apply articles before tags to preserve foreign-key relationships.
  for (const table of ["articles", "tags"]) {
    for (const file of readdirSync(`data/${table}`).filter((name) => name.endsWith(".sql")).sort()) {
      const batch = join(directory, "batch.json");
      writeFileSync(batch, JSON.stringify([{ sql: readFileSync(`data/${table}/${file}`, "utf8") }]));
      const result = spawnSync(process.execPath, [
        "node_modules/cf/bin/cf", "d1", "raw", database, "--batch", `@${batch}`,
        ...(remote ? [] : ["--local", "--persist-to", ".cloudflare/state"]),
      ], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Failed to apply data/${table}/${file}`);
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

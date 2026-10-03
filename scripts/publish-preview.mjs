import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PRODUCTION_D1_ID, selectDatabaseId } from "./preview-config.mjs";

function requireEnvironment(name, pattern, env) {
  const value = env[name];
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const detail = (result.stderr || result.stdout || "")
      .trim()
      .replaceAll(token || "\0", "[REDACTED]");
    throw new Error(
      `${command} ${args.slice(0, 2).join(" ")} failed with exit code ${result.status ?? "unknown"}${detail ? `: ${detail}` : "."}`,
    );
  }
  return result.stdout;
}

export function parseDeployment(stdout) {
  let result;
  try {
    result = JSON.parse(stdout);
  } catch (error) {
    throw new Error("cf previews deploy returned invalid JSON.", {
      cause: error,
    });
  }
  if (
    !result ||
    result.type !== "preview" ||
    !Array.isArray(result.preview_urls) ||
    !Array.isArray(result.deployment_urls)
  ) {
    throw new Error("cf previews deploy returned an unexpected response.");
  }
  const stableUrl = result.preview_urls.find(isHttpsUrl);
  const deploymentUrl = result.deployment_urls.find(isHttpsUrl);
  if (!stableUrl || !deploymentUrl) {
    throw new Error("cf previews deploy did not return both preview URLs.");
  }
  return { stableUrl, deploymentUrl };
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".workers.dev") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
    );
  } catch {
    return false;
  }
}

function writeOutputs(values) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(
      outputFile,
      `${Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")}\n`,
    );
  }
}

function writeSummary({ pullRequest, headSha, stableUrl, deploymentUrl }) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  appendFileSync(
    summaryFile,
    [
      `## Worker preview for PR #${pullRequest}`,
      "",
      `- Exact head: \`${headSha}\``,
      `- Stable preview: ${stableUrl}`,
      `- Immutable deployment: ${deploymentUrl}`,
      "",
    ].join("\n"),
  );
}

export function publishPreview({
  runCommand = run,
  env = process.env,
} = {}) {
  const pullRequest = requireEnvironment("PR_NUMBER", /^\d+$/, env);
  if (!Number.isSafeInteger(Number(pullRequest)) || Number(pullRequest) < 1) {
    throw new Error("PR_NUMBER must be a positive safe integer.");
  }
  const headSha = requireEnvironment(
    "PR_HEAD_SHA",
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i,
    env,
  );
  const databaseId = selectDatabaseId(
    true,
    env.CLOUDFLARE_PREVIEW_D1_DATABASE_ID,
  );
  if (databaseId === PRODUCTION_D1_ID) {
    throw new Error("Refusing to deploy a Preview with production D1.");
  }

  const stdout = runCommand(process.execPath, [
    "node_modules/cf/bin/cf",
    "previews",
    "deploy",
    `pr-${pullRequest}`,
    "--mode",
    "production",
  ]);
  const { stableUrl, deploymentUrl } = parseDeployment(stdout);
  const artifact = {
    pull_request: Number(pullRequest),
    head_sha: headSha,
    preview_database_id: databaseId,
    preview_url: stableUrl,
    deployment_url: deploymentUrl,
  };

  writeFileSync("preview-result.json", `${JSON.stringify(artifact, null, 2)}\n`);
  writeOutputs({
    head_sha: headSha,
    preview_url: stableUrl,
    deployment_url: deploymentUrl,
  });
  writeSummary({
    pullRequest,
    headSha,
    stableUrl,
    deploymentUrl,
  });
  return artifact;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const artifact = publishPreview();
    process.stdout.write(`${JSON.stringify(artifact)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

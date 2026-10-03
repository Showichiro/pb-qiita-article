import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const COMMENT_MARKER = "<!-- pb-qiita-worker-preview -->";
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const URL_PATTERN = /^https:\/\/[a-z0-9.-]+\.workers\.dev\/?$/i;

function requireEnvironment(name, pattern) {
  const value = process.env[name];
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return value;
}

function runGh(args) {
  const result = spawnSync("gh", ["api", ...args], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `gh api failed with exit code ${result.status ?? "unknown"}: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return result.stdout;
}

function validateUrl(value) {
  if (!URL_PATTERN.test(value)) {
    throw new Error("Preview URL is not a workers.dev HTTPS URL.");
  }
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Preview URL contains unexpected URL components.");
  }
  return url.href;
}

export function buildPreviewComment(preview) {
  const pullRequest = String(preview.pull_request);
  if (
    !/^\d+$/.test(pullRequest) ||
    !Number.isSafeInteger(Number(pullRequest)) ||
    Number(pullRequest) < 1 ||
    !SHA_PATTERN.test(preview.head_sha)
  ) {
    throw new Error("Preview result has an invalid PR number or head SHA.");
  }
  const stableUrl = validateUrl(preview.preview_url);
  const deploymentUrl = validateUrl(preview.deployment_url);

  return [
    COMMENT_MARKER,
    "### Worker preview",
    "",
    `- Exact head: \`${preview.head_sha}\``,
    `- Stable preview: ${stableUrl}`,
    `- Immutable deployment: ${deploymentUrl}`,
    "",
    "_This preview uses the shared nonproduction D1 database and synthetic fixture data._",
  ].join("\n");
}

export function publishPreviewComment({
  preview,
  runCommand = runGh,
  repository = process.env.GITHUB_REPOSITORY,
  expectedPullRequest = process.env.PR_NUMBER,
  expectedHeadSha = process.env.PR_HEAD_SHA,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) {
    throw new Error("GITHUB_REPOSITORY is missing or invalid.");
  }
  if (
    String(preview.pull_request) !== expectedPullRequest ||
    preview.head_sha?.toLowerCase() !== expectedHeadSha?.toLowerCase()
  ) {
    throw new Error(
      "Preview result does not match the pull request event for this job.",
    );
  }
  const body = buildPreviewComment(preview);
  const endpoint = `repos/${repository}/issues/${preview.pull_request}/comments`;
  const listed = JSON.parse(
    runCommand([endpoint, "--paginate", "--slurp"]),
  );
  if (!Array.isArray(listed) || !listed.every(Array.isArray)) {
    throw new Error("GitHub returned an unexpected PR comments response.");
  }
  const prior = listed.flat().find(
    (comment) =>
      typeof comment.body === "string" &&
      comment.body.includes(COMMENT_MARKER),
  );
  if (prior) {
    if (!Number.isSafeInteger(prior.id) || prior.id <= 0) {
      throw new Error("Existing preview comment has an invalid comment ID.");
    }
    runCommand([
      `repos/${repository}/issues/comments/${prior.id}`,
      "--method",
      "PATCH",
      "--field",
      `body=${body}`,
    ]);
    return "updated";
  }
  runCommand([
    endpoint,
    "--method",
    "POST",
    "--field",
    `body=${body}`,
  ]);
  return "created";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const file = process.env.PREVIEW_RESULT_FILE || "preview-result.json";
    const preview = JSON.parse(readFileSync(file, "utf8"));
    const result = publishPreviewComment({ preview });
    process.stdout.write(`PR preview comment ${result}.\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

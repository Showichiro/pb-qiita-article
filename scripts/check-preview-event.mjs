import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function required(name, pattern) {
  const value = process.env[name];
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return value;
}

const pullRequest = required("PR_NUMBER", /^\d+$/);
const headSha = required(
  "PR_HEAD_SHA",
  /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i,
);
const repository = required(
  "GITHUB_REPOSITORY",
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
);
const actor = process.env.GITHUB_ACTOR;
if (actor === "dependabot[bot]") {
  throw new Error("Dependabot previews are disabled.");
}

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required.");
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const pr = event.pull_request;
if (
  !pr ||
  String(pr.number) !== pullRequest ||
  pr.head?.repo?.full_name !== repository ||
  pr.base?.repo?.full_name !== repository ||
  pr.head?.sha?.toLowerCase() !== headSha.toLowerCase()
) {
  throw new Error(
    "This job is not for an exact-head pull request from this repository.",
  );
}

const checkout = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
});
if (checkout.error) throw checkout.error;
if (checkout.status !== 0) {
  throw new Error("Could not verify the checked-out pull request commit.");
}
if (checkout.stdout.trim().toLowerCase() !== headSha.toLowerCase()) {
  throw new Error("Checkout does not match the pull request's exact head SHA.");
}

# Immutable data generations

The Worker Cron is the canonical writer. It fetches and validates every Qiita
page before accessing D1. The old incremental update service is retired.

An import owns a UUID and records the active generation it started from.
Prepared statements insert articles and tags only while that owner has a
staging generation. Row and tag counts are checked before readiness. The final
D1 batch publishes the generation and changes its active pointer together,
conditional on the base generation and sequence still matching. A competing
publisher cannot replace the winner. Chunk failures keep the active snapshot
unchanged and delete the failed import's owned rows.

The SHA-256 manifest includes every displayed field, article ID and normalized
tag set using JSON framing. Identical imports preserve the version and sequence
without writing another snapshot. A complete empty upstream snapshot is valid;
an incomplete or invalid fetch never becomes a generation.

Published snapshots are immutable. Retention keeps the three newest published
generations and always protects the active pointer and in-flight staging rows.
Foreign keys cascade removal of old snapshot rows. Retention failures are logged
after publication and cannot turn an already published generation into failed.
A crashed import can leave staging rows; automated cleanup of abandoned owners
is deferred because elapsed time alone does not establish ownership expiry.

Migration `0001` preserves the legacy tables and backfills existing rows before
publishing `legacy`. An empty migrated database has no active generation and
returns 503 until a complete Cron import succeeds. Apply migrations before
deploying the new Worker. Production migrations and deployment are separate
operations and were not performed while developing this change.

## HTTP contract

- `GET /api/data-version` returns the current version, sequence, timestamp and
  manifest counts with `Cache-Control: no-store`.
- `GET /api/data-versions?limit=3` lists retained published generations. A positive
  integer is required; values above ten are capped at ten.
- Article, ranking and time-series responses retain their existing JSON shape
  and add `X-Data-Version`.
- `X-Expected-Data-Version` selects a retained published snapshot. An unavailable
  version returns 409 with the current `X-Data-Version`. No active generation
  returns 503. Reads use a primary-first D1 session and recheck retention before
  returning the result.
- Native page bootstrap data contains `dataVersion` and `publishedSequence` from
  the same selected generation as its rows.

## Client cache and update behavior

TanStack Query owns data retrieval and subscriptions for all three islands.
Keys contain the normalized request and adopted generation. Ranking display
choices and analysis chart metrics do not create additional result requests.
Results remain fresh indefinitely within a generation; inactive retention is
24 hours with a shared limit of 100 inactive completed results. Observed results
and prefetches awaiting adoption are protected from that limit.

SSR results seed the matching query key before rendering. Metadata is checked
at startup and on focus/reconnect when its 60-second freshness period expires.
New metadata announces an update without replacing displayed rows. An explicit
update fetches even if the version is unchanged, adopts only a successful
response, and resets article pagination to page one. Old inactive generation
cache entries are removed after adoption. Failures keep existing rows and offer
retry. Response-header mismatches never enter the requested old generation's
cache. Obsolete search responses cannot replace a newer accepted search.

Hosted previews apply the generation migration only to the recognized synthetic
fixture DB. Earlier PR previews continue using its retained legacy tables.
Cron remains disabled in previews.

## Hono RPC evaluation (SHO-113)

`src/rpc-contract.typecheck.ts` verifies the real exported app type with Hono's
client helpers: article, analysis and metadata success response types match the
public schemas, and unknown query fields are rejected. No server runtime import
enters the client bundles. This follows the
[official Hono RPC contract](https://hono.dev/docs/guides/rpc).

RPC is feasible for sharing route types, but the current coerced/defaulted query
schemas expose normalized numeric inputs and some required fields to the typed
client. Arbitrary response headers still need runtime validation, and the 409/503
contract must be handled explicitly. Phase 4 keeps ordinary GET requests with
generation headers and runtime response validation. A later RPC migration should
first simplify query input types and preserve these same version/error checks.

## Verification

Miniflare tests use actual migrations and cover initial/empty imports, ownership
fences, simultaneous initial and subsequent publication, partial chunk failure,
unchanged manifests, retention cascading, retained API reads and native SSR
version agreement. Client tests cover seeded startup, history/cache reuse,
metadata announcements, explicit refresh, failures, generation mismatch,
obsolete requests, input composition and unmount cleanup. The preview helpers
also verify idempotent generation migration against local D1.

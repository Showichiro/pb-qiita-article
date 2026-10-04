# PB-QIITA-APP

Hono application for Qiita articles and rankings, hosted on Cloudflare Workers with D1.

## Development

Use Node.js 24 LTS and Bun 1.4.2 (see .node-version and .bun-version).
Bun installs dependencies and runs scripts; the cf CLI runs under Node because it does not support the Bun runtime.

~~~sh
bun install --frozen-lockfile
bun run schema:apply
bun run dev
~~~

Open http://localhost:5173. Local migrations and Vite use the same project-local .cloudflare/state directory.
Vite's local dev and preview configurations disable remote bindings, so they use the
local D1 database in `.cloudflare/state` even if a binding is later marked remote.
The database commands below also default to local mode; explicit `:remote` scripts
are separate operations that target the configured remote database.

~~~sh
bun run typecheck
bunx biome lint src/
bun run test:ci
bun run deploy:check
bun run preview
~~~

The test suite uses Miniflare D1 databases. Vitest has a separate configuration so it does not start the Vite Workers plugin.
Use bun run format and bun run lint to apply formatting and lint fixes.
Generate migrations with bun run schema:gen.

## Frontend architecture

Hono owns routing, request validation, and the HTML shell. React 19 enhances
the article, ranking, and analysis pages as islands. Each page has native
server-rendered content and GET controls that work before JavaScript loads or
if the client bundle cannot start.

Server handlers resolve a published data generation through `withDataVersion`.
Page loaders in `src/services/articleQueries.ts`, `rankingQueries.ts`, and
`analysisQueries.ts` fetch the data before rendering. Pages receive plain data,
so the native HTML and escaped JSON bootstrap use the same rows and version.
The article API and page loader share normalized search retrieval; ranking
requests share date normalization, and its page loader reads both rankings
concurrently. Database functions retain their publication checks, including the
final retention check in `withDataVersion`.

TanStack Query owns retrieval and caching for all three islands. SSR data seeds
the generation-specific query keys before mounting. `useVersionedQuery` shares
prefetching, request-intent checks, failure state, retry, and explicit refresh.
Ranking commits only after both datasets succeed. Screen-specific callbacks
commit results inside transitions and keep editable drafts and display choices
independent of requests. Superseded results cannot replace a newer intent.

`search-history.ts` shares URL writes and history-listener cleanup. Each screen
owns URL parsing, draft validation, and its debounce or presentation behavior.
Old-generation cache cleanup runs after the result subscription hooks so that
previous observers have detached before inactive results are removed.

The mount adapters transfer native form values, focus, and text selection before
replacing the fallback DOM. They preserve the native form if a safe transfer is
not possible. See [the generation contract](docs/data-generations.md) and
[the shared hook contract](src/client/hooks/README.md).

Client TSX files use `@jsxImportSource react`; the repository default remains
`hono/jsx` for server components. Vite and `vite-ssr-components` resolve the client
entry to emitted production assets. Run `bun run dev` for the server and client
together; the existing build and deployment commands also build the island.

React UI primitives live under `src/client/ui`. Their styles are scoped to the
island and coexist with the existing Tailwind/daisyUI shell. Only components
needed by the current screens are introduced; additional controls can follow as
search and analysis features expand.

The project roadmap is [P-SHO-3: PB Qiita UI Evolution](https://linear.app/showiv/project/pb-qiita-ui-evolution-70fa2817d65e).
M1 introduces the React foundation and article island. M2 extends search and
shareable URL state; M3 adds ranking and time-series visualizations; M4 evaluates
TanStack Query and Hono RPC. TanStack Query, TanStack Router, and Hono RPC are not
adopted in M1. The current client uses a small fetch wrapper and the existing
Zod/OpenAPI API contract.

## Workers and cf migration

The project now uses cf 1.0.0-beta.10 and @cloudflare/vite-plugin 2.0 beta, pinned exactly because these releases are beta.
Wrangler and the Hono Pages adapter are no longer dependencies. cloudflare.config.ts preserves the existing DB binding and database UUID.
Vite builds .cloudflare/output/v0; cf deploy consumes that output with --prebuilt --mode production.
We call Vite directly because cf build fails to spawn cf-vite on Windows in this beta.
Miniflare 4 remains the latest stable test dependency; cf and its Vite plugin use their own Miniflare 5 alpha internally.
Zod 4/OpenAPI 1, Vite 8, Vitest 5, TypeScript 7 and the remaining libraries have been updated.

Official references:
- https://developers.cloudflare.com/cf/projects/cloudflare-config/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://qiita.com/api/v2/docs
- https://developers.cloudflare.com/cf/get-started/
- https://developers.cloudflare.com/cf/projects/
- https://developers.cloudflare.com/cf/wrangler/reference/
- https://zod.dev/v4/changelog
- https://vite.dev/guide/migration

## Deployment

CI validates pull requests without Cloudflare credentials. Same-repository PRs also deploy Worker previews; forks and Dependabot skip this credential-dependent job.
Pushes to main deploy the Worker. Set repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
The token must allow Worker Preview deployment and D1 database list/create/query access.

Each hosted preview uses a dedicated shared nonproduction D1 named
`pb-qiita-preview`, never the production binding. The workflow creates that
database on first use and reuses it by exact name; it applies the checked-in
schema and inserts eight fictional articles and sixteen fictional tags once,
in one atomic batch marked `fixture-v1`. It does not read or export production
data or the `data/` seed files. Every run verifies the actual `isPreview`
configuration resolves to the provisioned nonproduction D1 before deployment.
The four requested PR previews share this small synthetic fixture database.
The articles are dated 2026-07-08 through 2026-10-02; for the default 90-day
analysis view at the time of this change, use
`/analysis?since=2026-07-06&until=2026-10-03&bucket=day`.

The preview job checks out the exact PR head SHA, records both stable and
immutable deployment URLs in the job summary, a PR comment, and a
`worker-preview-pr-<number>-<sha>` artifact. The current `cf` beta exposes no
preview-delete command; after a PR closes, remove its Preview using the
Cloudflare dashboard. Retire the shared preview D1 only after all previews
using it are removed, and verify its ID is not the production database first.
Local `bun run preview` remains separate and uses local D1.

~~~sh
# Authenticate separately from an existing Wrangler login:
node node_modules/cf/bin/cf auth login
bun run deploy
# Explicit remote database operations, when required:
bun run schema:apply:remote
~~~

The new public URL is https://pb-qiita-articles.<account-subdomain>.workers.dev, as printed by cf deploy.
The existing https://pb-qiita-articles.pages.dev site is not redirected by this change and continues serving its last Pages deployment.
After the first successful Worker deployment, update external links or configure a custom domain. Keeping the old Pages project permits rollback without deleting data.
No production deployment or remote migration is required for local verification.
Qiita refresh runs in the Worker at 15:00 UTC (00:00 JST) daily. Configure the secret QIITA_API_KEY in Cloudflare Dashboard: Workers & Pages > pb-qiita-articles > Settings > Variables and Secrets (type: Secret); the former GitHub QIITA_API secret is not automatically available to Workers. All org:primebrains pages are fetched and validated before D1 is read or changed. Validated articles and tags are staged as an immutable snapshot in bounded prepared-statement batches. A final transactional compare-and-swap publishes the generation and its active pointer together. Unchanged snapshots preserve the current generation. API errors, invalid responses, duplicate IDs, changing totals or pagination limits abort the run without writes. Successful runs log the published generation and sequence; failures propagate to Cron monitoring. SQL snapshots and the update-PR workflow have been removed. Existing articles are backfilled into a published legacy generation. An empty database returns 503 until its first complete import; tests create their own fixtures. See [the generation contract](docs/data-generations.md).

Hosted preview D1 usage is isolated from production but still counts against account-level D1 usage limits.

Dependency overrides pin patched esbuild, sharp and undici versions; bun audit reports no vulnerabilities. Drizzle migration generation and D1 tests are verified against these overrides.
Local cf D1 migration checks run on Windows in CI: the beta CLI stalled during local migration setup on the Ubuntu runner. Linux still validates types, lint, all D1 tests, Workers builds and deployment dry-runs; preview deployment is verified on Linux. The preview bootstrap/config/output helpers have standalone mock and Miniflare coverage via `bun run test:preview`.


### Article search

The native GET form at /articles and its React enhancement support title keyword (q), author ID or name (author), multiple exact tags (all selected tags must match), and inclusive like/stock count ranges (minLikes/maxLikes/minStocks/maxStocks). Tags use repeated URL parameters, for example /articles?q=React&tags=C%23&tags=TypeScript&minLikes=0&maxStocks=100; commas remain part of a tag name. Keywords, authors and tags are trimmed, empty filters are omitted, and counts must be nonnegative safe integers with the lower bound no greater than the upper bound.

Search resets pagination; pagination and browser history preserve every committed filter. Controls keep an editable draft while requests run using TanStack Query, Suspense, an error boundary and transitions. The server form remains usable before JavaScript loads or if the client bundle fails, and enhancement preserves draft values, multiple tag selections, focus and text selection. Tags selected through a saved URL remain available even when absent from the database tag options.

Title and author substring matching ignores ASCII letter case and preserves non-ASCII case; percent, underscore and backslash are literal characters. The database uses parameterized SQLite `instr(lower(column), lower(text))` to support the full 200-character input limit without hitting D1's [50-byte LIKE/GLOB pattern limit](https://developers.cloudflare.com/d1/platform/limits/). SQLite's built-in [`lower`](https://www.sqlite.org/lang_corefunc.html#lower) folds ASCII only.

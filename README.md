# PB-QIITA-APP

Hono application for Qiita articles and rankings, hosted on Cloudflare Workers with D1.

## Development

Use Node.js 24 LTS and Bun 1.4.2 (see .node-version and .bun-version).
Bun installs dependencies and runs scripts; the cf CLI runs under Node because it does not support the Bun runtime.

~~~sh
bun install --frozen-lockfile
bun run schema:apply
bun run data:apply
bun run dev
~~~

Open http://localhost:5173. Local migrations, seed data and Vite use the same project-local .cloudflare/state directory.
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

Hono owns routing, validation, the HTML shell, and database access. React 19 owns
the interactive article list inside `#articles-app`; the header, page title, and
ranking page continue to use Hono JSX. This is an incremental React island, with
server-rendered article content available when JavaScript is disabled or the
client bundle cannot start.

`src/client/main.tsx` mounts `ArticlesApp` on the articles page. The server passes
the initial query and articles in an escaped JSON bootstrap, so the first React
render can use the same data. Subsequent searches and pagination fetch
`/api/articles` without navigating the entire page. Loading, empty, and failure
states belong to the island. The API and D1 schema remain compatible.

The island follows React's [Async rendering model](https://react.dev/reference/react/use):
search/history events start a request once and retain its Promise in React state.
The results component reads it with `use`; `Suspense` owns initial waiting and an
Error Boundary owns failures. Retry creates a fresh Promise and resets that boundary.
SSR bootstrap arrays remain synchronous, so mounting does not fetch or flash a fallback.
An unseeded first load uses a bounded Promise cache to survive render retries.

`useTransition` marks result changes as non-urgent and provides `isPending`;
previous rows remain visible while searching, with pagination disabled until commit.
Controlled filter inputs update immediately outside the Transition. Superseded
event-handler requests are aborted and cannot commit over the latest Promise. History subscriptions
use React 19 callback-ref cleanup and are removed on unmount. There is no fetching
`useEffect` or manual loading/error state; the mount adapter's `useLayoutEffect` only
coordinates replacement of the Hono fallback DOM and transfers its unsent form
values and focus. If an edit arrives after the transfer snapshot, or focused SSR
content has no client counterpart, the native GET form stays available. Bootstrap
rows are paired with their server query; after subscribing to history the island
rechecks the current URL and loads mismatched conditions in a Transition. The limit
draft stays a string while editing; submitting an empty value uses the default 10.
Unseeded initial requests share a bounded module cache with no TTL or per-consumer
unmount cancellation; the normal Hono page always supplies bootstrap articles. See [Suspense](https://react.dev/reference/react/Suspense)
and [useTransition](https://react.dev/reference/react/useTransition).

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
- https://developers.cloudflare.com/cf/get-started/
- https://developers.cloudflare.com/cf/projects/
- https://developers.cloudflare.com/cf/wrangler/reference/
- https://zod.dev/v4/changelog
- https://vite.dev/guide/migration

## Deployment

CI validates pull requests without Cloudflare credentials. Same-repository PRs also deploy Worker previews; forks and Dependabot skip this credential-dependent job.
Pushes to main deploy the Worker. Set repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
The token must allow Workers deployment and access to the existing D1 binding; a Pages-only token needs updated permissions.
Hosted Worker previews use the existing D1 binding, so they read the same data as
production. This is separate from local `bun run preview`, which uses local D1.
Preview validation does not run remote migrations or seed data.

~~~sh
# Authenticate separately from an existing Wrangler login:
node node_modules/cf/bin/cf auth login
bun run deploy
# Explicit remote database operations, when required:
bun run schema:apply:remote
bun run data:apply:remote
~~~

The new public URL is https://pb-qiita-articles.<account-subdomain>.workers.dev, as printed by cf deploy.
The existing https://pb-qiita-articles.pages.dev site is not redirected by this change and continues serving its last Pages deployment.
After the first successful Worker deployment, update external links or configure a custom domain. Keeping the old Pages project permits rollback without deleting data.
No production deployment or remote migration is required for local verification.
The scheduled Qiita refresh uses cf D1 commands against the remote database and
keeps the existing QIITA_API secret. Local development is isolated from that
database, but hosted previews, scheduled refreshes, and explicit remote scripts
remain separate sources of remote D1 activity; the cause of any quota usage is
not determined here.

Dependency overrides pin patched esbuild, sharp and undici versions; bun audit reports no vulnerabilities. Drizzle migration generation and D1 tests are verified against these overrides.
Local cf D1 migration/seed checks run on Windows in CI: the beta CLI stalled during local migration setup on the Ubuntu runner. Linux still validates types, lint, all D1 tests, Workers builds and deployment dry-runs; preview deployment is verified on Linux.


### Article search

The native GET form at /articles and its React enhancement support title keyword (q), author ID or name (author), multiple exact tags (all selected tags must match), and inclusive like/stock count ranges (minLikes/maxLikes/minStocks/maxStocks). Tags use repeated URL parameters, for example /articles?q=React&tags=C%23&tags=TypeScript&minLikes=0&maxStocks=100; commas remain part of a tag name. Keywords, authors and tags are trimmed, empty filters are omitted, and counts must be nonnegative safe integers with the lower bound no greater than the upper bound.

Search resets pagination; pagination and browser history preserve every committed filter. Controls keep an editable draft while requests run using React use, Suspense, an error boundary and transitions. The server form remains usable before JavaScript loads or if the client bundle fails, and enhancement preserves draft values, multiple tag selections, focus and text selection. Tags selected through a saved URL remain available even when absent from the database tag options.

Title and author substring matching ignores ASCII letter case and preserves non-ASCII case; percent, underscore and backslash are literal characters. The database uses parameterized SQLite `instr(lower(column), lower(text))` to support the full 200-character input limit without hitting D1's [50-byte LIKE/GLOB pattern limit](https://developers.cloudflare.com/d1/platform/limits/). SQLite's built-in [`lower`](https://www.sqlite.org/lang_corefunc.html#lower) folds ASCII only.

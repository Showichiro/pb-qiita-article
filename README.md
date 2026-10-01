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
Both database commands default to local mode; remote writes have explicit :remote scripts.

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
Worker previews use the existing D1 binding, so they read the same data as production. Preview validation does not run remote migrations or seed data.

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
The scheduled Qiita refresh uses cf D1 commands and keeps the existing QIITA_API secret.

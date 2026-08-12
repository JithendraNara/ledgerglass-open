# Site deployment

Ledgerglass Open is a separate Cloudflare static-assets Worker named
`ledgerglass-open`. It has no Worker script, database, login, cookies, analytics,
private MCP call, or production health widget.

Live site: [ledgerglass-open.jnara01.workers.dev](https://ledgerglass-open.jnara01.workers.dev/)

## Workers Builds settings

Connect `JithendraNara/ledgerglass-open` under the Worker's **Settings → Builds**.
Use the current Cloudflare Workers Builds contract:

- Production branch: `main`
- Build command: `npm ci && npm run site:build`
- Deploy command: `npx wrangler deploy --config site/wrangler.toml`
- Root directory: repository root
- Non-production builds: enabled for pull-request previews
- Non-production deploy command: `npx wrangler versions upload --config site/wrangler.toml`
- Build cache: enabled
- Include watch paths: `site/**`, `public-bundle/**`, `src/public-core*`, `plugins/**`,
  `docs/**`, `README.md`, `package.json`, `package-lock.json`
- Exclude all other paths

The repository is connected and the committed `site/wrangler.toml` points the Worker
at `site/dist`. There are no runtime variables or secrets. Initial publication uses
the account's `workers.dev` subdomain; a custom domain can be evaluated separately.
The repository connection and one-repository GitHub authorization were verified on
2026-08-12; later matching commits are built and deployed by Workers Builds.
The Cloudflare Workers and Pages GitHub App is explicitly authorized for this public
repository; private Ledgerglass remains outside that installation.
The former public Worker was removed after the Ledgerglass Open URL passed live route
checks; it is not retained as a parallel product surface.

Cloudflare documentation checked 2026-08-12:

- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
- [Static Assets](https://developers.cloudflare.com/workers/static-assets/)

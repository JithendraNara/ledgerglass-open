# Showcase deployment

The showcase is a separate Cloudflare static-assets Worker named
`ledgerglass-showcase`. It has no Worker script, database, login, cookies, analytics,
private MCP call, or production health widget.

## Workers Builds settings

Connect `JithendraNara/ledgerglass-starter` under the Worker's **Settings → Builds**.
Use the current Cloudflare Workers Builds contract:

- Production branch: `main`
- Build command: `npm ci && npm run site:build`
- Deploy command: `npx wrangler deploy --config site/wrangler.toml`
- Root directory: repository root
- Non-production builds: enabled for pull-request previews
- Include watch paths: `site/**`, `showcase/**`, `src/public-core*`, `plugins/**`,
  `docs/**`, `README.md`, `package.json`, `package-lock.json`
- Exclude all other paths

The committed `site/wrangler.toml` points the Worker at `site/dist`. There are no
runtime variables or secrets. Initial publication uses the account's `workers.dev`
subdomain; a custom domain can be evaluated separately.

Cloudflare documentation checked 2026-08-12:

- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
- [Static Assets](https://developers.cloudflare.com/workers/static-assets/)

# Ledgerglass Worker

Cloudflare-native implementation of Ledgerglass Starter.

## Runtime

- `src/index.ts`: request and scheduled-event routing
- `src/mcp-http.ts`: stateless MCP transport, bearer auth, host/origin policy
- `src/mcp.ts`: tools and prompts
- `src/simplefin.ts`: bounded SimpleFIN client and credential claim/storage
- `src/sync.ts`: daily overlap sync and request-window splitting
- `src/repository.ts`: D1 queries, coverage, finance semantics, corrections/eval
- `src/ai.ts`, `src/llm.ts`: Workers AI and optional Gateway reasoning
- `src/vectorize.ts`: semantic index
- `migrations/`: additive D1 schema

Authentication is deliberately small. The origin accepts distinct read and
owner bearer credentials. Cloudflare MCP Portal supplies client-facing OAuth,
capability policy, and its stored upstream bearer credential. The Worker has no
custom OAuth provider or dynamic client registration.

## Development

```bash
npm ci
npm run worker:typecheck
npm test
npm run worker:dry-run
```

For setup and deployment, use [../docs/SETUP.md](../docs/SETUP.md). For security
boundaries, use [../SECURITY.md](../SECURITY.md).

## Operations

- Daily cron defaults to 12:15 UTC.
- Ordinary sync: 45 days plus five-day overlap.
- New/problem accounts: bounded backfill up to SimpleFIN's 90-day range.
- Public `/health`: liveness only.
- Public `/ready`: boolean readiness/degradation only.
- `/admin/*`: owner bearer required.
- MCP event records: operation name, auth class, status, and duration only.
- Workers Logs: disabled by default.

Use `worker_operational_status`, `simplefin_data_coverage`, and sync history for
evidence. A configured cron is not proof until a scheduled run exists.

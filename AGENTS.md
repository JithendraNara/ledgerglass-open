# AGENTS.md

Public, independent Ledgerglass Starter. SimpleFIN-backed; not an official
SimpleFIN product.

Start:

1. Read `README.md`, `docs/SETUP.md`, and `SECURITY.md`.
2. Keep real deployment configuration in a private checkout.
3. Run `npm run check` before every push.

Hard boundaries:

- Never commit credentials, financial rows, statements, database/vector
  exports, real Cloudflare IDs, private endpoints, account inventories, or
  production evidence.
- Public examples use `finance.example.com`, zero IDs, synthetic merchants, and
  environment-variable placeholders.
- Cloudflare MCP Portal provides client OAuth. Do not add custom OAuth/DCR back
  to the Worker without a separate threat model and compatibility requirement.
- Origin auth remains required behind the Portal. Read and owner credentials
  stay distinct.
- Keep Workers Logs disabled by default. Application audit records must exclude
  prompts, arguments, payloads, and credentials.
- Do not copy learned merchant/card rules or operational exceptions from a
  private deployment into this generic starter.

Financial rules:

- Start with `agent_guidance`, `worker_operational_status`,
  `simplefin_data_coverage`, and `finance_overview`.
- Keep currencies separate. Never add unlike currency amounts.
- Treat model output as enrichment, not source evidence. Surface fallback,
  confidence, parse, freshness, and coverage status.
- SimpleFIN `endDate` is human-inclusive and API-exclusive.
- Default daily sync uses five-day overlap and bounded windows; remain within
  current SimpleFIN published request limits.
- Claiming a setup token must persist the resulting Access URL before success.
- Prefer summaries/search over loading complete transaction history.
- Preview corrections and evaluation changes before applying them.
- Protected holdout evidence must not feed training or corrections.

Change rules:

- Add regression tests for behavioral fixes.
- Update docs and changelog with user-visible changes.
- Preserve additive migration order.
- Run privacy audit, both typechecks, build, tests, dependency audit, and Worker
  dry-run.

# Finance Agent Workflow

Operating guide for an agent connected to Ledgerglass Starter.

## Trust first

Call, in order:

1. `agent_guidance`
2. `auth_context`
3. `worker_operational_status`
4. `connection_status`
5. `simplefin_data_coverage`
6. `finance_overview`

`health.issues[]` is the global trust gate. Account coverage is the local trust
gate. Name stale, partial, source-warning, fallback, or low-confidence evidence
when it can change an answer. A configured cron is not proven until sync history
contains a completed scheduled run.

## Authentication layers

- SimpleFIN setup token: one-time credential claimed into an Access URL.
- Worker origin: read or owner bearer credential.
- Cloudflare MCP Portal: client OAuth, user access, tool allowlist, and upstream
  origin credential.

Agents must not request a new SimpleFIN token merely to answer a question.
They cannot retrieve Worker secret plaintext.

## Sync and source semantics

Ordinary sync runs once daily, overlaps five days, and makes bounded requests.
New or coverage-poor accounts may receive an account-scoped backfill within the
published SimpleFIN 90-day maximum. Only an owner should call `sync_simplefin`.

SimpleFIN is source evidence. D1 is a query cache plus operational evidence.
AI category/merchant fields are enrichment. Keep these provenance layers
distinct.

## Question routing

- Overall position: `finance_overview`
- Exact period totals: `summarize_cashflow`
- Merchant: `merchant_summary`
- Known text/date/account: `search_transactions`
- Conceptual similarity: `semantic_transaction_search`
- Subscription-like spend: `detect_subscriptions`
- Wider recurring commitments: `detect_recurring_obligations`
- Multi-step question: `query_finance`, with deterministic facts attached
- Unusual activity: `find_unusual_transactions`

Keep currencies separate. If `currency_mode` is `multiple`, report each
`by_currency` value instead of inventing a converted total.

Use `simplefin_raw_account` only for one account and a narrow limit. Prefer
compact outputs to complete histories.

## AI evidence

Successful enrichment is not proof that a model succeeded. Inspect:

- `ai_enriched`
- `fallback_enriched`
- `parse_fallback`
- `quota_fallback`
- `low_confidence_enriched`
- model/provider and routing telemetry

SQL amounts, source rows, and coverage are deterministic. Briefings and anomaly
reasons may fall back; state that provenance. Never let a narrative override
attached transaction evidence.

## Owner changes

Owner tools include sync, setup-token claiming, categorization, transaction
correction, undo, eval labeling/runs, audit events, and insight refresh.

- Preview where supported.
- Explain the intended write.
- Preserve source values and audit history.
- Keep `holdout` and `rolling_holdout` evidence out of prompt corrections.
- Re-run status/coverage after a change.
- Check Vectorize recovery if a changed row should be searchable.

## Operational evidence

`worker_audit_events` stores bounded operation name, auth class, status, and
duration. It does not store prompts, tool arguments, finance responses, request
bodies, or tokens. Workers Logs remain off by default.

For MCP client connection and token rotation, use [SETUP.md](SETUP.md). Portal
OAuth grants are revoked in Cloudflare; origin bearer credentials are rotated
separately.

## Safety

Never expose setup tokens, Access URLs, bearer credentials, statements,
database exports, private endpoint names, or raw financial records in public
logs, issues, screenshots, or repositories.

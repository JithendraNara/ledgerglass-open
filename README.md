# Ledgerglass

[![CI](https://github.com/JithendraNara/ledgerglass-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/JithendraNara/ledgerglass-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

I wanted my agents to understand my money without asking me to trust a black
box. Ledgerglass is the evidence-backed ledger I built for that job.

[Read the public build journal and try the fictional demo.](https://ledgerglass-showcase.jnara01.workers.dev/)

This public repository is the reusable core and the notebook around my private
installation. It contains working financial contracts, synthetic demonstrations,
architecture, a portable Agent Plugin template, and the static showcase site. It is
not a copy of production and contains no real account data, statement contents,
credentials, endpoints, resource IDs, or operational history.

Ledgerglass uses [SimpleFIN Bridge](https://beta-bridge.simplefin.org/) as one
upstream connector. It is an independent project and is not affiliated with or
endorsed by SimpleFIN.

## The problem that shaped it

A transaction feed can be connected and still incomplete. Pending rows disappear.
Closed statements reveal missing activity. Similar-looking payments are not always
the same transaction. Models can sound certain while contradicting a proven transfer.

The design that emerged is deliberately layered:

```text
provider feeds / statements / owner corrections
  -> immutable observations
  -> reversible operational ledger
  -> deterministic financial views
  -> evidence-bearing MCP results
  -> agents that investigate, explain, and retry bounded work
```

The ledger owns amounts, dates, relationships, lifecycle, and provenance. Agents work
around that record; they do not become the record.

## What is here

- `src/public-core.ts` — integer money, currency separation, date windows,
  statement matching, pending lifecycle, and settled cashflow contracts.
- `showcase/` — generated capability registry, dated research sources, six explicitly
  fictional cases, and deterministic bundle hashes.
- `site/` — the personal builder journal and browser-only fictional demo, built with
  Astro and deployed as a separate Cloudflare static-assets Worker.
- `plugins/ledgerglass/` — portable Agent Plugin and skills using a placeholder MCP
  URL and no credentials.
- `worker/` — a compact deploy-your-own Cloudflare Worker starter with D1, scheduled
  SimpleFIN sync, MCP tools, optional derived enrichment, and safe health endpoints.
- `docs/` — setup, evidence rules, architecture decisions, research, and limitations.

The generated [capability matrix](showcase/capabilities.json) is the durable list of
what is working public core, what is a synthetic demonstration, and what remains a
private architecture note. The site consumes the same file; claims are not copied by
hand across surfaces.

## Try it locally

```bash
npm ci
npm run check
npm run site:dev
```

`npm run check` runs privacy scanning, bundle verification, TypeScript and Worker
checks, synthetic core tests, site diagnostics/build, dependency audit, migration
replay, and a Wrangler dry run.

To deploy your own finance Worker, follow [docs/SETUP.md](docs/SETUP.md). Use your own
Cloudflare resources and authenticated MCP gateway. The sample configuration contains
placeholders only.

## A public projection, not a mirror

The private repository owns the canonical capability registry. Its exporter starts
from an explicit allowlist and creates the four files in `showcase/`; it never copies
the private tree and attempts redaction afterward.

Publication uses a narrowly installed GitHub App and one continuously updated review
branch. The private workflow may open or update a pull request. It cannot merge it.
Public CI repeats every privacy, contract, content, and site check without access to
the private repository. An unchanged export creates no review noise.

See [docs/PUBLIC_BUNDLE.md](docs/PUBLIC_BUNDLE.md) for the contract and
[docs/HUMAN_VOICE.md](docs/HUMAN_VOICE.md) for the editorial gate.

## Honest limits

- This is personal software, not a financial institution, adviser, or hosted service.
- Synthetic cases prove contracts; they do not prove every institution behaves alike.
- The public steward is a deterministic simulator and architecture story. Private
  prompts, quotas, bindings, and model routes are not published.
- Models can enrich or explain evidence. They do not guarantee correctness.
- A complete closed statement may outrank an incomplete feed for that cycle, but only
  after arithmetic and matching checks pass.
- Partial or stale evidence stays visible instead of being filled with invented rows.

## Documentation

- [Build your own](docs/SETUP.md)
- [Finance-agent workflow](docs/FINANCE_AGENT_WORKFLOW.md)
- [Reusable patterns](docs/PATTERNS.md)
- [Public bundle contract](docs/PUBLIC_BUNDLE.md)
- [Human voice and design review](docs/HUMAN_VOICE.md)
- [Showcase deployment](docs/SITE_DEPLOYMENT.md)
- [Research record](showcase/research.json)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

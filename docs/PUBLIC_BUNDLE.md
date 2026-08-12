# Private-to-public bundle

The private Ledgerglass repository is the operational source of truth. This public
repository is its reusable core and public notebook, not a production mirror.

## Publication path

```text
private behavior change
  -> capability delivery declaration
  -> allowlisted deterministic export
  -> privacy and synthetic contract checks
  -> one public review pull request
  -> independent public CI and site preview
  -> owner merge
```

The exporter emits only `showcase/capabilities.json`, `research.json`,
`scenarios.json`, and `BUNDLE.json`. `BUNDLE.json` records byte counts, SHA-256 file
hashes, and an export digest. Identical inputs produce identical output.

It is intentionally impossible for this repository to pull private source in CI.
The private workflow pushes the tiny generated projection using a GitHub App installed
only here. The app has metadata-read, contents-write, and pull-requests-write access.
It owns one branch and cannot merge its pull request.

## Capability delivery

- `core`: working reusable code and synthetic contract proof.
- `demo`: fictional scenario and architecture, without the private implementation.
- `private-note`: an honest public explanation and limitation.

Material private behavior cannot silently disappear from the registry. An emergency
may defer public work with an expiring reason; the parity debt remains visible until
the capability is updated.

## Privacy boundary

The public bundle rejects private hosts, local paths, credentials, financial rows,
statements, PDFs, databases, account inventories, institution inventories, Cloudflare
resource identifiers, private prompts, operational telemetry, and private commit IDs.
Case studies are written from generalized lessons and fictional data, never lightly
redacted personal records.

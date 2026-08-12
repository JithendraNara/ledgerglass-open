# Security Policy

Ledgerglass Starter processes financial data. Treat every deployment as
sensitive even when it has one owner.

## Reporting

Use a private GitHub security advisory. Do not put credentials, private
endpoints, account identifiers, statements, transaction rows, or D1 exports in
a public issue.

## Trust boundaries

- SimpleFIN Access URL: upstream financial credential.
- `ADMIN_TOKEN`: owner writes, sync, setup, corrections, and evaluation.
- `MCP_BEARER_TOKEN`: read-only origin access.
- Cloudflare MCP Portal: client OAuth and exposed-tool policy.
- Worker origin: validates its bearer credential even behind a Portal.
- D1, KV, and Vectorize: private deployment data, never repository artifacts.

The Portal does not replace origin authentication. Browser-origin and request
host checks are allowlisted; wildcards are not the default.

## Required controls

- Store credentials with Worker secrets or Cloudflare's Portal credential
  storage; never tracked files.
- Use distinct, random read and owner tokens. Rotate on suspected disclosure.
- Restrict the Portal to intended identities and least-privilege tools.
- Keep Workers Logs disabled unless you accept their metadata boundary.
- Keep public `/health` and `/ready` responses free of account details.
- Review dependency and privacy-audit results before deployment.
- Back up D1 privately and test restoration. Do not commit the backup.

`claim_setup_token` persists the resulting Access URL before returning success;
it never returns the credential. Remote responses and SimpleFIN error lists are
sanitized and bounded. Operational telemetry excludes prompts, tool arguments,
finance payloads, request bodies, and authorization values.

## Public repository controls

CI has read-only repository permissions and no deployment secrets. It runs
`npm run check`, including a privacy scan, dependency audit, tests, builds, and
Wrangler dry-run. Production deployment must happen from a private,
owner-authorized environment.

The scan is a guardrail, not proof that publication is safe. Review the diff
and Git history before making any repository public.

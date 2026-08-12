# Changelog

## Unreleased

- Rename the public product surface to Ledgerglass Starter and clarify its independent relationship to SimpleFIN.
- Replace the custom GitHub OAuth and dynamic-registration stack with bearer-protected origin access behind Cloudflare MCP Portal.
- Adopt stateless MCP transport, prompts, discovery cache hints, and strict host/origin allowlists.
- Fix inclusive sync end dates, preserve claimed Access URLs, add bounded upstream reads, sanitize source errors, and use five-day overlap with bounded backfill windows.
- Preserve duplicate id-less provider rows with opaque, ordinal fallback identities.
- Separate balance and cashflow results by currency instead of combining unlike units.
- Remove private-deployment merchant/card assumptions from generic categorization rules.
- Update Cloudflare, MCP, Agents, Wrangler, and test dependencies; resolve the dependency audit findings.
- Add regression tests, migration replay, public-repository privacy scanning, read-only CI, and Worker dry-run validation.
- Use current Node 24-based GitHub Actions runners without deprecation warnings.

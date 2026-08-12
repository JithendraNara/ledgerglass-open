# Changelog

## Unreleased

- Recast the repository as the public Ledgerglass reference implementation and reusable core, with a generated capability registry, dated research record, six privacy-safe contract cases, and a human-written builder-journal README.
- Add reusable integer-money, currency, statement-reconciliation, pending-lifecycle, and cashflow contracts with synthetic regression tests.
- Add an Astro static site with personal build history, evidence tour, interactive synthetic case studies, trust model, capability matrix, research journal, and Cloudflare static-assets configuration.
- Add a portable placeholder-only Agent Plugin template and independent validation for bundle hashes, privacy boundaries, skill metadata, and generated-marketing language.
- Publish the journal as a separate static-assets Worker with Git-based production and preview builds, canonical page URLs, and no runtime access to the private system.
- Raise muted editorial text contrast to meet the site's WCAG AA accessibility gate.

- Establish the public product surface as Ledgerglass Open and clarify its independent relationship to SimpleFIN.
- Replace the custom GitHub OAuth and dynamic-registration stack with bearer-protected origin access behind Cloudflare MCP Portal.
- Adopt stateless MCP transport, prompts, discovery cache hints, and strict host/origin allowlists.
- Fix inclusive sync end dates, preserve claimed Access URLs, add bounded upstream reads, sanitize source errors, and use five-day overlap with bounded backfill windows.
- Preserve duplicate id-less provider rows with opaque, ordinal fallback identities.
- Separate balance and cashflow results by currency instead of combining unlike units.
- Remove private-deployment merchant/card assumptions from generic categorization rules.
- Update Cloudflare, MCP, Agents, Wrangler, and test dependencies; resolve the dependency audit findings.
- Add regression tests, migration replay, public-repository privacy scanning, read-only CI, and Worker dry-run validation.
- Use current Node 24-based GitHub Actions runners without deprecation warnings.

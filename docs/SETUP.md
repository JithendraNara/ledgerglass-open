# Setup

Deploy Ledgerglass Starter into your own Cloudflare account. Never commit the
values produced by these steps.

## 1. Install and validate

```bash
npm ci
npm run check
```

Node 22.18 or later is required.

## 2. Create storage

```bash
npx wrangler d1 create ledgerglass --config worker/wrangler.toml
npx wrangler kv namespace create CONFIG_KV --config worker/wrangler.toml
npx wrangler vectorize create ledgerglass-transactions --dimensions=1024 --metric=cosine
```

Copy the returned IDs into `worker/wrangler.toml` in your private checkout.
Keep placeholder IDs in any public fork. If you change `EMBEDDING_MODEL`, use
the model's actual output dimension when creating Vectorize.

Set `MCP_HOSTNAME` to the exact hostname serving the Worker. The MCP transport
rejects other hostnames. Set `MCP_ALLOWED_ORIGIN` only for a browser client that
actually sends an `Origin` header; server-to-server Portal traffic does not
need a wildcard.

`SIMPLEFIN_ALLOWED_HOSTS` defaults to the official Bridge hostnames. If you use
a compatible self-hosted server, replace it with reviewed exact hostnames; do
not use a wildcard.

## 3. Apply migrations

```bash
npx wrangler d1 migrations apply DB --remote --config worker/wrangler.toml
```

## 4. Store origin credentials

```bash
npx wrangler secret put MCP_BEARER_TOKEN --config worker/wrangler.toml
npx wrangler secret put ADMIN_TOKEN --config worker/wrangler.toml
npx wrangler secret put SIMPLEFIN_ACCESS_URL --config worker/wrangler.toml
```

- `MCP_BEARER_TOKEN`: read tools only.
- `ADMIN_TOKEN`: owner tools and operational routes.
- `SIMPLEFIN_ACCESS_URL`: credential obtained by claiming a one-time SimpleFIN
  setup token. The owner-only `claim_setup_token` tool can claim and persist it
  in `CONFIG_KV`; call that tool only through a direct owner connection, not a
  Portal or third-party agent. A Worker secret takes precedence.

Do not store a one-time setup token after it has been claimed. Never paste any
of these values into an issue, chat transcript, screenshot, committed config,
or Worker log.

## 5. Deploy the private origin

```bash
npm run check
npx wrangler deploy --config worker/wrangler.toml
```

Optional custom domain:

```toml
[[routes]]
pattern = "finance.example.com"
custom_domain = true
```

Smoke tests disclose only liveness/readiness:

```bash
curl https://finance.example.com/health
curl https://finance.example.com/ready
```

## 6. Put Cloudflare MCP Portal in front

In Cloudflare Zero Trust, open **AI controls → MCP servers** and add the origin
URL `https://finance.example.com/mcp`. Configure the upstream authorization
header with the owner or read bearer token in Cloudflare; do not put it in this
repository. Create an MCP Portal, add the server, select the tools you want
clients to see, and authorize only your identity.

Connect ChatGPT, Claude, Codex, or another OAuth-capable client to the Portal's
generated MCP URL. The client authenticates to Cloudflare; Cloudflare supplies
the origin bearer credential upstream. Re-sync Portal capabilities after the
Worker adds or removes tools or prompts.

See [the Portal example](../examples/cloudflare-mcp-portal.example.md).

## 7. Direct private clients (optional)

Clients that can inject a private header may call the Worker directly:

```json
{
  "mcpServers": {
    "ledgerglass": {
      "type": "streamable-http",
      "url": "https://finance.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_BEARER_TOKEN}"
      }
    }
  }
}
```

Prefer the read credential. Use the owner credential only in an owner-controlled
agent that genuinely needs writes.

## 8. Verify

After deployment:

1. Confirm `/ready` is ready.
2. Initialize MCP and inspect `tools/list` plus `prompts/list`.
3. Call `agent_guidance` and `simplefin_data_coverage`.
4. Run one owner sync, then repeat it to check idempotency.
5. Confirm currency-separated finance output and bounded operational events.
6. Verify Workers Logs remain disabled unless you have independently accepted
   their data-retention boundary.

## Rotation and removal

Rotate an origin token with `wrangler secret put`, update the Portal upstream
credential, then revoke the old value. A Portal OAuth grant and an origin bearer
credential are separate. Remove Portal client grants in Cloudflare; rotate the
origin credential if it may have escaped Cloudflare.

# Cloudflare MCP Portal Example

Use Cloudflare MCP Portal as the OAuth and tool-policy boundary.

1. Deploy the bearer-protected Worker origin at
   `https://finance.example.com/mcp`.
2. Add that URL under Cloudflare Zero Trust **AI controls → MCP servers**.
3. Store `Authorization: Bearer <origin token>` as the upstream credential in
   Cloudflare, never in this repository.
4. Create a Portal, attach the server, allow only the intended finance tools,
   and restrict user access.
5. Connect the client to the Portal-generated URL and finish Cloudflare OAuth.
6. Re-sync capabilities after changing tools or prompts.

Do not expose `claim_setup_token` through the Portal. It accepts a one-time
credential and is intended only for a direct owner-controlled connection.

The Worker does not expose GitHub OAuth, OAuth discovery, or dynamic client
registration. Direct private clients may still use a bearer header if their
configuration storage is appropriate for financial access.

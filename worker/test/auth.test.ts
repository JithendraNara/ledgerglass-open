import { describe, expect, it } from "vitest";
import { authorizeMcp } from "../src/auth.js";

describe("origin bearer authorization", () => {
  const env = { ADMIN_TOKEN: "admin-secret", MCP_BEARER_TOKEN: "reader-secret" } as never;

  it("separates admin and read-only identities", async () => {
    const admin = await authorizeMcp(new Request("https://origin.example/mcp", {
      headers: { authorization: "Bearer admin-secret" },
    }), env);
    const reader = await authorizeMcp(new Request("https://origin.example/mcp", {
      headers: { authorization: "Bearer reader-secret" },
    }), env);
    expect(admin).toMatchObject({ isAdmin: true, authType: "bearer-admin" });
    expect(reader).toMatchObject({ isAdmin: false, authType: "bearer-readonly" });
  });

  it("rejects invalid credentials", async () => {
    const response = await authorizeMcp(new Request("https://origin.example/mcp"), env);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });
});

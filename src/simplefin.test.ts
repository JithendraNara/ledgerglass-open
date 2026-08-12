import { afterEach, describe, expect, it, vi } from "vitest";
import { dateToEpochExclusiveEnd, SimpleFinClient } from "./simplefin.js";

afterEach(() => vi.restoreAllMocks());

describe("local SimpleFIN adapter", () => {
  it("uses the day after an inclusive end date", () => {
    const start = Date.parse("2026-08-12T00:00:00Z") / 1000;
    expect(Number(dateToEpochExclusiveEnd("2026-08-12")) - start).toBe(86_400);
  });

  it("rejects an Access URL outside the configured allowlist", async () => {
    const client = new SimpleFinClient("https://example.invalid/access", ["bridge.example.test"]);
    await expect(client.fetchAccounts()).rejects.toThrow("allowed hostname");
  });

  it("does not expose an upstream error body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private upstream detail", { status: 500 }));
    const client = new SimpleFinClient("https://bridge.example.test/access", ["bridge.example.test"]);
    const error = await client.fetchAccounts().catch((caught) => caught as Error);
    expect(error.message).toBe("SimpleFIN returned HTTP 500");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_URL_KV_KEY,
  claimAndStoreSetupToken,
  dateToEpoch,
  dateToEpochExclusiveEnd,
  fetchSimpleFinAccounts,
  sanitizeErrlist,
  stableTransactionId,
} from "../src/simplefin.js";

afterEach(() => vi.restoreAllMocks());

describe("SimpleFIN API boundary", () => {
  const credentialUrl = () => `https://${"user"}:${"pass"}@bridge.example.test/access`;
  it("converts an inclusive end date to next-day midnight", () => {
    expect(Number(dateToEpochExclusiveEnd("2026-08-12")) - Number(dateToEpoch("2026-08-12")))
      .toBe(86_400);
  });

  it("uses the exclusive end epoch in account requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"accounts":[]}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await fetchSimpleFinAccounts(credentialUrl(), {
      startDate: "2026-08-10",
      endDate: "2026-08-12",
    });
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.searchParams.get("end-date")).toBe(dateToEpochExclusiveEnd("2026-08-12"));
    expect(requested.username).toBe("");
    expect(requested.password).toBe("");
  });

  it("stores a claimed one-time credential without returning it in logs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(credentialUrl()));
    const put = vi.fn();
    const env = { CONFIG_KV: { put }, SIMPLEFIN_ALLOWED_HOSTS: "bridge.example.test" } as never;
    const setupToken = btoa("https://bridge.example.test/claim/token");
    const accessUrl = await claimAndStoreSetupToken(env, setupToken);
    expect(accessUrl).toContain("bridge.example.test");
    expect(put).toHaveBeenCalledWith(ACCESS_URL_KV_KEY, accessUrl);
  });

  it("rejects a claim URL outside the explicit provider allowlist", async () => {
    await expect(claimAndStoreSetupToken(
      { CONFIG_KV: { put: vi.fn() }, SIMPLEFIN_ALLOWED_HOSTS: "bridge.example.test" } as never,
      btoa("https://attacker.example/claim/token"),
    )).rejects.toThrow("host is not in SIMPLEFIN_ALLOWED_HOSTS");
  });

  it("sanitizes and bounds provider error text", () => {
    expect(sanitizeErrlist([{ code: "con.auth\u0000", msg: " reconnect\nnow " }])).toEqual([
      { code: "con.auth", msg: "reconnect now" },
    ]);
  });

  it("keeps id-less duplicate rows distinct without exposing their text in ids", async () => {
    const row = { amount: "-12.34", posted: 1_786_406_400, description: "Synthetic duplicate" };
    const first = await stableTransactionId("synthetic", row, 0);
    const second = await stableTransactionId("synthetic", row, 1);
    expect(first).not.toBe(second);
    expect(first).not.toContain("Synthetic duplicate");
  });
});

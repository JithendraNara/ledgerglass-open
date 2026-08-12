import { describe, expect, it } from "vitest";
import {
  inclusiveDateToExclusiveEpoch,
  findExactTransferPairs,
  findRecurringCandidates,
  pendingLifecycle,
  reconcileStatement,
  sumByCurrency,
  summarizeCashflow,
  summarizeMerchants,
  summarizeNetWorth,
  type LedgerRow,
} from "./public-core.js";

const evidence = [{ source: "provider" as const, observationId: "obs-synthetic", observedAt: "2026-08-01T12:00:00Z" }];
const row = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  id: "ledger-synthetic-1",
  accountId: "account-synthetic",
  date: "2026-07-10",
  amountMinor: -1250,
  currency: "USD",
  description: "North Market",
  status: "posted",
  firstSeenAt: "2026-07-10T12:00:00Z",
  lastSeenAt: "2026-07-10T12:00:00Z",
  operationallyActive: true,
  evidence,
  ...overrides,
});

describe("public Ledgerglass core", () => {
  it("keeps integer money separated by currency", () => {
    expect(sumByCurrency([
      { amountMinor: 125, currency: "USD" },
      { amountMinor: 75, currency: "USD" },
      { amountMinor: 500, currency: "EUR" },
    ])).toEqual({ USD: 200, EUR: 500 });
    expect(() => sumByCurrency([{ amountMinor: 1.2, currency: "USD" }])).toThrow("integer minor units");
  });

  it("turns a human-inclusive date into the provider exclusive boundary", () => {
    expect(inclusiveDateToExclusiveEpoch("2026-08-12") - Date.parse("2026-08-12T00:00:00Z") / 1000).toBe(86_400);
  });

  it("proves statement arithmetic before matching", () => {
    const result = reconcileStatement({
      statementId: "statement-synthetic-invalid",
      accountId: "account-synthetic",
      accountPolarity: "liability-positive",
      currency: "USD",
      cycleStart: "2026-07-01",
      cycleEnd: "2026-07-31",
      openingBalanceMinor: -1000,
      closingBalanceMinor: -999,
      transactions: [{ ordinal: 1, date: "2026-07-10", balanceImpactMinor: 1250, description: "North Market" }],
    }, [row()]);
    expect(result.result).toBe("invalid");
    expect(result.matches).toHaveLength(0);
  });

  it("matches duplicate statement rows independently", () => {
    const ledger = [row({ id: "one" }), row({ id: "two" })];
    const result = reconcileStatement({
      statementId: "statement-synthetic-duplicates",
      accountId: "account-synthetic",
      accountPolarity: "liability-positive",
      currency: "USD",
      cycleStart: "2026-07-01",
      cycleEnd: "2026-07-31",
      openingBalanceMinor: 0,
      closingBalanceMinor: 2500,
      transactions: [
        { ordinal: 1, date: "2026-07-10", balanceImpactMinor: 1250, description: "North Market" },
        { ordinal: 2, date: "2026-07-10", balanceImpactMinor: 1250, description: "North Market" },
      ],
    }, ledger);
    expect(result.result).toBe("partial");
    expect(result.ambiguities).toHaveLength(2);
    expect(result.matches).toHaveLength(0);
  });

  it("isolates near-date ambiguity while identifying exact repairs", () => {
    const result = reconcileStatement({
      statementId: "statement-synthetic-repair",
      accountId: "account-synthetic",
      accountPolarity: "liability-positive",
      currency: "USD",
      cycleStart: "2026-07-01",
      cycleEnd: "2026-07-31",
      openingBalanceMinor: 0,
      closingBalanceMinor: 3250,
      transactions: [
        { ordinal: 1, date: "2026-07-10", balanceImpactMinor: 1250, description: "North Market" },
        { ordinal: 2, date: "2026-07-11", balanceImpactMinor: 2000, description: "River Books" },
      ],
    }, [row(), row({ id: "nearby", date: "2026-07-13", amountMinor: -2000, description: "Different text" })]);
    expect(result.matches).toEqual([{ statementOrdinal: 1, ledgerId: "ledger-synthetic-1", method: "exact" }]);
    expect(result.ambiguities).toEqual([{ statementOrdinal: 2, candidateLedgerIds: ["nearby"], reason: "near-date-amount" }]);
    expect(result.result).toBe("partial");
  });

  it("expires stale pending rows reversibly after both policy boundaries", () => {
    const pending = row({ status: "pending", date: "2026-07-01", lastSeenAt: "2026-07-20T00:00:00Z" });
    expect(pendingLifecycle(pending, "2026-07-21T23:59:59Z").state).toBe("current_pending");
    expect(pendingLifecycle(pending, "2026-07-22T00:00:00Z")).toMatchObject({ state: "expired_assumed", operationallyActive: false });
  });

  it("excludes pending and inactive rows from settled cashflow", () => {
    const summary = summarizeCashflow([
      row({ amountMinor: -1250 }),
      row({ id: "income", amountMinor: 5000 }),
      row({ id: "pending", status: "pending", amountMinor: -900 }),
      row({ id: "expired", status: "pending", operationallyActive: false, amountMinor: -700 }),
    ]);
    expect(summary).toEqual({
      byCurrency: { USD: { inflowMinor: 5000, outflowMinor: 1250, netMinor: 3750 } },
      excludedPending: 2,
    });
  });

  it("keeps net worth and debt separated by currency", () => {
    expect(summarizeNetWorth([
      { accountId: "cash", kind: "asset", balanceMinor: 10_000, currency: "USD", observedAt: "2026-08-01T00:00:00Z" },
      { accountId: "card", kind: "liability", balanceMinor: -2_500, currency: "USD", observedAt: "2026-08-01T00:00:00Z" },
      { accountId: "travel", kind: "asset", balanceMinor: 8_000, currency: "EUR", observedAt: "2026-08-01T00:00:00Z" },
    ])).toEqual({
      USD: { assetsMinor: 10_000, debtMinor: 2_500, netWorthMinor: 7_500 },
      EUR: { assetsMinor: 8_000, debtMinor: 0, netWorthMinor: 8_000 },
    });
  });

  it("groups merchants and recurring candidates from settled rows only", () => {
    const rows = [
      row({ id: "a", date: "2026-06-10", description: "North Market #12", amountMinor: -1200 }),
      row({ id: "b", date: "2026-07-10", description: "NORTH MARKET 12", amountMinor: -1300 }),
      row({ id: "c", status: "pending", description: "North Market #12", amountMinor: -1400 }),
    ];
    expect(summarizeMerchants(rows)).toEqual([{ merchant: "north market 12", currency: "USD", amountMinor: 2500, transactionCount: 2 }]);
    expect(findRecurringCandidates(rows)).toEqual([{ merchant: "north market 12", currency: "USD", occurrences: 2, typicalAmountMinor: 1300 }]);
    expect(findRecurringCandidates([row({ id: "a", date: "2026-06-10" }), row({ id: "b", date: "2026-07-10" })])).toEqual([
      { merchant: "north market", currency: "USD", occurrences: 2, typicalAmountMinor: 1250 },
    ]);
  });

  it("pairs only unique exact cross-account transfers", () => {
    expect(findExactTransferPairs([
      row({ id: "out", accountId: "cash", amountMinor: -5000 }),
      row({ id: "in", accountId: "card", amountMinor: 5000, date: "2026-07-11" }),
    ])).toEqual([{ outflowId: "out", inflowId: "in", amountMinor: 5000, currency: "USD" }]);
  });
});

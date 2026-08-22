import { describe, expect, it } from "vitest";
import { backtestForecast, expandRecurrence, materializeSchedule, projectForecast } from "./forecast-core.js";

describe("public Wave 4 forecast core", () => {
  it("expands recurrence without provider or account dependencies", () => {
    expect(expandRecurrence({ kind: "monthly_days", startDate: "2030-01-01", days: ["last"] }, "2030-01-01", "2030-03-31"))
      .toEqual(["2030-01-31", "2030-02-28", "2030-03-31"]);
  });

  it("keeps liability payment direction explicit", () => {
    const result = projectForecast({
      accountId: "synthetic-card", currency: "USD", accountKind: "liability", cutoffDate: "2030-02-01", startingBalanceCents: 100000,
      schedules: [{ scheduleId: "payment", revision: 1, accountId: "synthetic-card", currency: "USD", direction: "inflow", flowKind: "debt_payment", sourceClass: "debt_requirement", status: "active", authority: "statement", amountModel: { kind: "exact", amountCents: 25000 } }],
      occurrences: [{ occurrenceId: "payment", scheduleId: "payment", scheduleRevision: 1, accountId: "synthetic-card", currency: "USD", direction: "inflow", flowKind: "debt_payment", expectedDate: "2030-02-03", amount: { expectedCents: 25000, lowCents: 25000, highCents: 25000 }, sourceClass: "debt_requirement", state: "expected", scenarioEligible: { committed: true, expected: true, possible: true } }],
    }, [3]);
    expect(result.days.at(-1)?.expectedBalanceCents).toBe(75000);
  });

  it("projects amount ranges and backtests only matured evidence", () => {
    const schedule = { scheduleId: "bill", revision: 1, accountId: "synthetic", currency: "USD", direction: "outflow" as const, flowKind: "bill", sourceClass: "statement_supported" as const, status: "active" as const, authority: "statement" as const, amountModel: { kind: "range" as const, minimumCents: 1000, maximumCents: 3000 }, recurrence: { kind: "once" as const, date: "2030-01-03" } };
    const occurrences = materializeSchedule(schedule, "2030-01-01", "2030-01-07");
    const forecastInput = { accountId: "synthetic", currency: "USD", accountKind: "asset" as const, cutoffDate: "2030-01-01", startingBalanceCents: 10000, schedules: [schedule], occurrences };
    const forecast = projectForecast(forecastInput, [2]);
    expect(forecast.days.at(-1)?.possibleLowBalanceCents).toBe(7000);
    expect(forecast.days.at(-1)?.possibleHighBalanceCents).toBe(9000);
    const backtest = backtestForecast([{ originId: "origin", originDate: "2030-01-01", forecastInput, actualBalances: [{ date: "2030-01-03", balanceCents: 8500 }] }], [2]);
    expect(backtest.metrics[0]).toMatchObject({ sampleCount: 1, balanceMaeCents: 500 });
  });

  it("keeps possible balance bounds ordered for signed inflows", () => {
    const schedule = { scheduleId: "income", revision: 1, accountId: "synthetic", currency: "USD", direction: "inflow" as const, flowKind: "income", sourceClass: "expected_income" as const, status: "active" as const, authority: "owner" as const, amountModel: { kind: "range" as const, minimumCents: 1000, maximumCents: 3000 }, recurrence: { kind: "once" as const, date: "2030-01-02" } };
    const occurrences = materializeSchedule(schedule, "2030-01-01", "2030-01-02");
    const result = projectForecast({
      accountId: "synthetic",
      currency: "USD",
      accountKind: "asset",
      cutoffDate: "2030-01-01",
      startingBalanceCents: 10000,
      schedules: [schedule],
      occurrences,
      pendingExposure: [{ exposureId: "pending-income", accountId: "synthetic", currency: "USD", direction: "inflow", amountCents: 2000, lowCents: 1000, highCents: 3000, expectedDate: "2030-01-02", eligible: true }],
    }, [1]);

    expect(result.days[0]).toMatchObject({
      possibleLowBalanceCents: 12000,
      possibleHighBalanceCents: 16000,
    });
  });
});

export type Currency = string;

export interface Money {
  amountMinor: number;
  currency: Currency;
}

export interface EvidenceRef {
  source: "provider" | "statement" | "manual" | "derived";
  observationId: string;
  observedAt: string;
}

export interface LedgerRow {
  id: string;
  accountId: string;
  date: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  status: "pending" | "posted" | "voided" | "superseded";
  firstSeenAt: string;
  lastSeenAt: string;
  operationallyActive: boolean;
  evidence: readonly EvidenceRef[];
}

export interface StatementRow {
  ordinal: number;
  date: string;
  balanceImpactMinor: number;
  description: string;
}

export interface StatementInput {
  statementId: string;
  accountId: string;
  accountPolarity: "asset-positive" | "liability-positive";
  currency: Currency;
  cycleStart: string;
  cycleEnd: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  transactions: readonly StatementRow[];
}

export interface StatementMatch {
  statementOrdinal: number;
  ledgerId: string;
  method: "exact" | "unique-date-amount";
}

export interface StatementAmbiguity {
  statementOrdinal: number;
  candidateLedgerIds: readonly string[];
  reason: "near-date-amount" | "competing-match";
}

export interface StatementReconciliation {
  arithmetic: {
    expectedClosingBalanceMinor: number;
    declaredClosingBalanceMinor: number;
    valid: boolean;
  };
  matches: readonly StatementMatch[];
  missingStatementOrdinals: readonly number[];
  unsupportedProviderIds: readonly string[];
  ambiguities: readonly StatementAmbiguity[];
  result: "exact" | "repaired" | "partial" | "invalid";
}

const DAY_MS = 86_400_000;

export function assertMoney(value: Money): Money {
  if (!Number.isSafeInteger(value.amountMinor)) throw new Error("Money must use integer minor units");
  if (!/^[A-Z]{3}$/.test(value.currency)) throw new Error("Currency must be a three-letter code");
  return value;
}

export function sumByCurrency(values: readonly Money[]): Readonly<Record<Currency, number>> {
  const totals: Record<string, number> = {};
  for (const value of values) {
    assertMoney(value);
    totals[value.currency] = (totals[value.currency] ?? 0) + value.amountMinor;
    if (!Number.isSafeInteger(totals[value.currency])) throw new Error("Money total exceeded safe integer range");
  }
  return totals;
}

export function inclusiveDateToExclusiveEpoch(date: string): number {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start)) throw new Error("Invalid calendar date");
  return Math.floor((start + DAY_MS) / 1000);
}

export function normalizeMerchant(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function ledgerAmount(statement: StatementInput, row: StatementRow): number {
  return statement.accountPolarity === "asset-positive" ? row.balanceImpactMinor : -row.balanceImpactMinor;
}

function daysBetween(left: string, right: string): number {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / DAY_MS;
}

export function reconcileStatement(statement: StatementInput, ledger: readonly LedgerRow[]): StatementReconciliation {
  const activity = statement.transactions.reduce((sum, row) => sum + row.balanceImpactMinor, 0);
  const expectedClosingBalanceMinor = statement.openingBalanceMinor + activity;
  const arithmetic = {
    expectedClosingBalanceMinor,
    declaredClosingBalanceMinor: statement.closingBalanceMinor,
    valid: expectedClosingBalanceMinor === statement.closingBalanceMinor,
  };
  if (!arithmetic.valid) {
    return { arithmetic, matches: [], missingStatementOrdinals: [], unsupportedProviderIds: [], ambiguities: [], result: "invalid" };
  }

  const cycleRows = ledger.filter((row) =>
    row.accountId === statement.accountId &&
    row.currency === statement.currency &&
    row.status === "posted" &&
    row.date >= statement.cycleStart &&
    row.date <= statement.cycleEnd,
  );
  const available = new Map(cycleRows.map((row) => [row.id, row]));
  const matches: StatementMatch[] = [];
  const ambiguities: StatementAmbiguity[] = [];
  const missingStatementOrdinals: number[] = [];

  for (const statementRow of statement.transactions) {
    const amount = ledgerAmount(statement, statementRow);
    const exact = [...available.values()].filter((row) =>
      row.date === statementRow.date &&
      row.amountMinor === amount &&
      normalizeMerchant(row.description) === normalizeMerchant(statementRow.description),
    );
    if (exact.length === 1) {
      matches.push({ statementOrdinal: statementRow.ordinal, ledgerId: exact[0].id, method: "exact" });
      available.delete(exact[0].id);
      continue;
    }
    if (exact.length > 1) {
      ambiguities.push({ statementOrdinal: statementRow.ordinal, candidateLedgerIds: exact.map((row) => row.id), reason: "competing-match" });
      continue;
    }

    const dateAmount = [...available.values()].filter((row) => row.date === statementRow.date && row.amountMinor === amount);
    if (dateAmount.length === 1) {
      matches.push({ statementOrdinal: statementRow.ordinal, ledgerId: dateAmount[0].id, method: "unique-date-amount" });
      available.delete(dateAmount[0].id);
      continue;
    }
    if (dateAmount.length > 1) {
      ambiguities.push({ statementOrdinal: statementRow.ordinal, candidateLedgerIds: dateAmount.map((row) => row.id), reason: "competing-match" });
      continue;
    }

    const nearby = [...available.values()].filter((row) => row.amountMinor === amount && daysBetween(row.date, statementRow.date) <= 3);
    if (nearby.length > 0) {
      ambiguities.push({ statementOrdinal: statementRow.ordinal, candidateLedgerIds: nearby.map((row) => row.id), reason: nearby.length === 1 ? "near-date-amount" : "competing-match" });
      continue;
    }
    missingStatementOrdinals.push(statementRow.ordinal);
  }

  const unsupportedProviderIds = [...available.keys()];
  const result = ambiguities.length > 0
    ? "partial"
    : missingStatementOrdinals.length > 0 || unsupportedProviderIds.length > 0
      ? "repaired"
      : "exact";
  return { arithmetic, matches, missingStatementOrdinals, unsupportedProviderIds, ambiguities, result };
}

export type PendingLifecycleState = "current_pending" | "expired_assumed" | "not_pending";

export interface PendingLifecycleDecision {
  state: PendingLifecycleState;
  operationallyActive: boolean;
  reason: "posted" | "fresh" | "within-age-window" | "within-observation-grace" | "stale-pending";
}

export function pendingLifecycle(row: LedgerRow, now: string): PendingLifecycleDecision {
  if (row.status !== "pending") return { state: "not_pending", operationallyActive: row.operationallyActive, reason: "posted" };
  const nowMs = Date.parse(now);
  const transactionMs = Date.parse(`${row.date}T00:00:00Z`);
  const firstSeenMs = Date.parse(row.firstSeenAt);
  const lastSeenMs = Date.parse(row.lastSeenAt);
  const ageBase = Number.isFinite(transactionMs) ? transactionMs : firstSeenMs;
  if (nowMs - ageBase < 14 * DAY_MS) return { state: "current_pending", operationallyActive: true, reason: "within-age-window" };
  if (nowMs - lastSeenMs < 48 * 60 * 60 * 1000) return { state: "current_pending", operationallyActive: true, reason: "within-observation-grace" };
  return { state: "expired_assumed", operationallyActive: false, reason: "stale-pending" };
}

export interface CashflowSummary {
  byCurrency: Readonly<Record<Currency, { inflowMinor: number; outflowMinor: number; netMinor: number }>>;
  excludedPending: number;
}

export function summarizeCashflow(rows: readonly LedgerRow[]): CashflowSummary {
  const byCurrency: Record<string, { inflowMinor: number; outflowMinor: number; netMinor: number }> = {};
  let excludedPending = 0;
  for (const row of rows) {
    if (!row.operationallyActive || row.status !== "posted") {
      if (row.status === "pending") excludedPending += 1;
      continue;
    }
    const bucket = byCurrency[row.currency] ?? { inflowMinor: 0, outflowMinor: 0, netMinor: 0 };
    if (row.amountMinor >= 0) bucket.inflowMinor += row.amountMinor;
    else bucket.outflowMinor += -row.amountMinor;
    bucket.netMinor += row.amountMinor;
    byCurrency[row.currency] = bucket;
  }
  return { byCurrency, excludedPending };
}

export interface AccountSnapshot {
  accountId: string;
  kind: "asset" | "liability";
  balanceMinor: number;
  currency: Currency;
  observedAt: string;
}

export function summarizeNetWorth(accounts: readonly AccountSnapshot[]): Readonly<Record<Currency, { assetsMinor: number; debtMinor: number; netWorthMinor: number }>> {
  const result: Record<string, { assetsMinor: number; debtMinor: number; netWorthMinor: number }> = {};
  for (const account of accounts) {
    assertMoney({ amountMinor: account.balanceMinor, currency: account.currency });
    const bucket = result[account.currency] ?? { assetsMinor: 0, debtMinor: 0, netWorthMinor: 0 };
    if (account.kind === "asset") bucket.assetsMinor += account.balanceMinor;
    else bucket.debtMinor += Math.abs(account.balanceMinor);
    bucket.netWorthMinor = bucket.assetsMinor - bucket.debtMinor;
    result[account.currency] = bucket;
  }
  return result;
}

export interface MerchantTotal {
  merchant: string;
  currency: Currency;
  amountMinor: number;
  transactionCount: number;
}

export function summarizeMerchants(rows: readonly LedgerRow[]): readonly MerchantTotal[] {
  const buckets = new Map<string, MerchantTotal>();
  for (const row of rows) {
    if (!row.operationallyActive || row.status !== "posted" || row.amountMinor >= 0) continue;
    const merchant = normalizeMerchant(row.description) || "unknown";
    const key = `${row.currency}\u0000${merchant}`;
    const bucket = buckets.get(key) ?? { merchant, currency: row.currency, amountMinor: 0, transactionCount: 0 };
    bucket.amountMinor += -row.amountMinor;
    bucket.transactionCount += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => right.amountMinor - left.amountMinor || left.merchant.localeCompare(right.merchant));
}

export interface TransferPair {
  outflowId: string;
  inflowId: string;
  amountMinor: number;
  currency: Currency;
}

export function findExactTransferPairs(rows: readonly LedgerRow[], maximumDays = 3): readonly TransferPair[] {
  const active = rows.filter((row) => row.operationallyActive && row.status === "posted");
  const candidates = new Map<string, string[]>();
  for (const outflow of active.filter((row) => row.amountMinor < 0)) {
    const matches = active.filter((inflow) =>
      inflow.amountMinor === -outflow.amountMinor &&
      inflow.currency === outflow.currency &&
      inflow.accountId !== outflow.accountId &&
      daysBetween(inflow.date, outflow.date) <= maximumDays,
    );
    if (matches.length === 1) candidates.set(outflow.id, [matches[0].id]);
  }
  const reverseCounts = new Map<string, number>();
  for (const [inflowId] of candidates.values()) reverseCounts.set(inflowId, (reverseCounts.get(inflowId) ?? 0) + 1);
  return [...candidates.entries()].flatMap(([outflowId, [inflowId]]) => {
    if (reverseCounts.get(inflowId) !== 1) return [];
    const outflow = active.find((row) => row.id === outflowId)!;
    return [{ outflowId, inflowId, amountMinor: -outflow.amountMinor, currency: outflow.currency }];
  });
}

export interface RecurringCandidate {
  merchant: string;
  currency: Currency;
  occurrences: number;
  typicalAmountMinor: number;
}

export function findRecurringCandidates(rows: readonly LedgerRow[]): readonly RecurringCandidate[] {
  const grouped = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    if (!row.operationallyActive || row.status !== "posted" || row.amountMinor >= 0) continue;
    const merchant = normalizeMerchant(row.description);
    const key = `${row.currency}\u0000${merchant}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return [...grouped.entries()].flatMap(([key, values]) => {
    if (values.length < 2) return [];
    const amounts = values.map((row) => -row.amountMinor).sort((a, b) => a - b);
    const typicalAmountMinor = amounts[Math.floor(amounts.length / 2)];
    const [currency, merchant] = key.split("\u0000");
    return [{ merchant, currency, occurrences: values.length, typicalAmountMinor }];
  }).sort((left, right) => right.typicalAmountMinor - left.typicalAmountMinor);
}

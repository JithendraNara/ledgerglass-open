/**
 * Ledgerglass public Wave 4 core.
 *
 * This file is deliberately dependency-free. It is the reusable arithmetic
 * boundary: recurrence expansion, integer-minor-unit scenarios, and
 * split-aware backtesting. Provider adapters, identities, credentials, and
 * operational orchestration stay outside this public module.
 */

export type DateAdjustment = "none" | "previous_weekday" | "next_weekday";
export type RecurrenceRule =
  | { kind: "once"; date: string; startDate?: string; endDate?: string; adjustment?: DateAdjustment }
  | { kind: "weekly"; startDate?: string; endDate?: string; intervalWeeks?: number; weekdays: number[]; adjustment?: DateAdjustment; occurrenceCount?: number }
  | { kind: "monthly_days"; startDate?: string; endDate?: string; intervalMonths?: number; days: Array<number | "last">; adjustment?: DateAdjustment; occurrenceCount?: number }
  | { kind: "monthly_ordinal_weekday"; startDate?: string; endDate?: string; intervalMonths?: number; ordinal: number; weekday: number; adjustment?: DateAdjustment; occurrenceCount?: number }
  | { kind: "annual"; startDate?: string; endDate?: string; month: number; day: number; adjustment?: DateAdjustment; occurrenceCount?: number };

export interface ExpandedOccurrence { nominalDate: string; adjustedDate: string }
const DAY = 86_400_000;
interface DateWindow { fromDate: string; toDate: string }
interface DateInput { date: string }
interface DateOffset extends DateInput { days: number }

const dateValue = ({ date }: DateInput): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid calendar date: ${date}`);
  return new Date(`${date}T00:00:00.000Z`);
};
const iso = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = ({ date, days }: DateOffset): string => iso(new Date(dateValue({ date }).getTime() + days * DAY));
const dateForMonth = ({ year, month, day }: { year: number; month: number; day: number }): string | null => {
  if (day < 1) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month ? iso(date) : null;
};
const validBounds = ({ rule, date }: { rule: { startDate?: string; endDate?: string }; date: string }): boolean => {
  if (rule.startDate && date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  return true;
};
const adjust = ({ date, policy }: DateInput & { policy?: DateAdjustment }): string => {
  if (!policy || policy === "none") return date;
  const weekday = dateValue({ date }).getUTCDay();
  if (weekday !== 0 && weekday !== 6) return date;
  const days = policy === "previous_weekday"
    ? (weekday === 0 ? -2 : -1)
    : (weekday === 0 ? 1 : 2);
  return addDays({ date, days });
};
const appendOccurrence = ({ out, nominalDate, window, policy }: {
  out: ExpandedOccurrence[];
  nominalDate: string;
  window: DateWindow;
  policy?: DateAdjustment;
}): void => {
  const adjustedDate = adjust({ date: nominalDate, policy });
  if (adjustedDate < window.fromDate) return;
  if (adjustedDate > window.toDate) return;
  out.push({ nominalDate, adjustedDate });
};
const positive = ({ value, name }: { value: number | undefined; name: string }): void => {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be positive`);
  if (value < 1) throw new Error(`${name} must be positive`);
};

const validateWindow = (window: DateWindow): void => {
  dateValue({ date: window.fromDate });
  dateValue({ date: window.toDate });
  if (window.fromDate > window.toDate) throw new Error("Expansion range must be ordered");
};

const validateRuleBounds = (rule: RecurrenceRule): void => {
  if (rule.startDate) dateValue({ date: rule.startDate });
  if (rule.endDate) dateValue({ date: rule.endDate });
  if (!rule.startDate || !rule.endDate) return;
  if (rule.startDate > rule.endDate) throw new Error("Recurrence bounds are inverted");
};

const validateExpansion = ({ rule, window }: { rule: RecurrenceRule; window: DateWindow }): void => {
  validateWindow(window);
  validateRuleBounds(rule);
};

const eligibleNominal = ({ rule, nominalDate, window }: {
  rule: RecurrenceRule;
  nominalDate: string;
  window: DateWindow;
}): boolean => {
  if (!validBounds({ rule, date: nominalDate })) return false;
  return nominalDate >= (rule.startDate ?? window.fromDate);
};

const occurrenceLimitExceeded = ({ count, rule }: { count: number; rule: Exclude<RecurrenceRule, { kind: "once" }> }): boolean =>
  count > (rule.occurrenceCount ?? Number.MAX_SAFE_INTEGER);

const expandOnce = ({ rule, window }: { rule: Extract<RecurrenceRule, { kind: "once" }>; window: DateWindow }): ExpandedOccurrence[] => {
  dateValue({ date: rule.date });
  const out: ExpandedOccurrence[] = [];
  if (!validBounds({ rule, date: rule.date })) return out;
  appendOccurrence({ out, nominalDate: rule.date, window, policy: rule.adjustment });
  return out;
};

const validWeekday = (day: number): boolean => {
  if (!Number.isInteger(day)) return false;
  if (day < 0) return false;
  return day <= 6;
};

const validateWeekdays = (weekdays: number[]): number[] => {
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  if (!unique.length) throw new Error("Invalid weekdays");
  for (const day of unique) {
    if (!validWeekday(day)) throw new Error("Invalid weekdays");
  }
  return unique;
};

const expandWeekly = ({ rule, window }: { rule: Extract<RecurrenceRule, { kind: "weekly" }>; window: DateWindow }): ExpandedOccurrence[] => {
  const interval = rule.intervalWeeks ?? 1;
  positive({ value: interval, name: "intervalWeeks" });
  const weekdays = validateWeekdays(rule.weekdays);
  const anchor = dateValue({ date: rule.startDate ?? window.fromDate });
  const weekStart = new Date(anchor.getTime() - anchor.getUTCDay() * DAY);
  const lastWeek = Math.floor((dateValue({ date: window.toDate }).getTime() - weekStart.getTime()) / (7 * DAY));
  const finalNominalDate = addDays({ date: window.toDate, days: 2 });
  const out: ExpandedOccurrence[] = [];
  let count = 0;
  for (let week = 0; week <= lastWeek + interval; week += interval) {
    for (const weekday of weekdays) {
      const nominalDate = iso(new Date(weekStart.getTime() + (week * 7 + weekday) * DAY));
      if (!eligibleNominal({ rule, nominalDate, window })) continue;
      if (nominalDate > finalNominalDate) return out;
      count += 1;
      if (occurrenceLimitExceeded({ count, rule })) return out;
      appendOccurrence({ out, nominalDate, window, policy: rule.adjustment });
    }
  }
  return out;
};

const validAnnualDate = ({ month, day }: { month: number; day: number }): boolean => {
  if (!Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  if (!Number.isInteger(day)) return false;
  return day >= 1 && day <= 31;
};

const expandAnnual = ({ rule, window }: { rule: Extract<RecurrenceRule, { kind: "annual" }>; window: DateWindow }): ExpandedOccurrence[] => {
  if (!validAnnualDate(rule)) throw new Error("Invalid annual date");
  const firstYear = dateValue({ date: rule.startDate ?? window.fromDate }).getUTCFullYear();
  const lastYear = dateValue({ date: window.toDate }).getUTCFullYear();
  const out: ExpandedOccurrence[] = [];
  let count = 0;
  for (let year = firstYear; year <= lastYear + 1; year += 1) {
    const nominalDate = dateForMonth({ year, month: rule.month - 1, day: rule.day });
    if (!nominalDate) continue;
    if (!eligibleNominal({ rule, nominalDate, window })) continue;
    count += 1;
    if (occurrenceLimitExceeded({ count, rule })) return out;
    appendOccurrence({ out, nominalDate, window, policy: rule.adjustment });
  }
  return out;
};

type MonthlyRule = Extract<RecurrenceRule, { kind: "monthly_days" | "monthly_ordinal_weekday" }>;

const monthlyDayCandidates = ({ rule, year, month }: {
  rule: Extract<RecurrenceRule, { kind: "monthly_days" }>;
  year: number;
  month: number;
}): string[] => {
  if (!rule.days.length) throw new Error("monthly_days requires days");
  return [...new Set(rule.days)]
    .map((day) => day === "last"
      ? iso(new Date(Date.UTC(year, month + 1, 0)))
      : dateForMonth({ year, month, day }))
    .filter((date): date is string => Boolean(date));
};

const validOrdinalRule = (rule: Extract<RecurrenceRule, { kind: "monthly_ordinal_weekday" }>): boolean => {
  if (!Number.isInteger(rule.ordinal)) return false;
  if (rule.ordinal < -1 || rule.ordinal > 5) return false;
  return validWeekday(rule.weekday);
};

const ordinalWeekdayCandidate = ({ rule, year, month }: {
  rule: Extract<RecurrenceRule, { kind: "monthly_ordinal_weekday" }>;
  year: number;
  month: number;
}): string[] => {
  if (!validOrdinalRule(rule)) throw new Error("Invalid monthly ordinal");
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const matching: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dateForMonth({ year, month, day });
    if (date && dateValue({ date }).getUTCDay() === rule.weekday) matching.push(date);
  }
  const candidate = rule.ordinal === -1 ? matching.at(-1) : matching[rule.ordinal - 1];
  return candidate ? [candidate] : [];
};

const monthlyCandidates = ({ rule, year, month }: { rule: MonthlyRule; year: number; month: number }): string[] =>
  rule.kind === "monthly_days"
    ? monthlyDayCandidates({ rule, year, month })
    : ordinalWeekdayCandidate({ rule, year, month });

const expandMonthly = ({ rule, window }: { rule: MonthlyRule; window: DateWindow }): ExpandedOccurrence[] => {
  const interval = rule.intervalMonths ?? 1;
  positive({ value: interval, name: "intervalMonths" });
  const anchor = dateValue({ date: rule.startDate ?? window.fromDate });
  const anchorMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
  const lastDate = dateValue({ date: window.toDate });
  const lastMonth = lastDate.getUTCFullYear() * 12 + lastDate.getUTCMonth();
  const out: ExpandedOccurrence[] = [];
  let count = 0;
  for (let monthNumber = anchorMonth; monthNumber <= lastMonth + interval; monthNumber += interval) {
    const year = Math.floor(monthNumber / 12);
    const month = monthNumber % 12;
    for (const nominalDate of monthlyCandidates({ rule, year, month })) {
      if (!eligibleNominal({ rule, nominalDate, window })) continue;
      count += 1;
      if (occurrenceLimitExceeded({ count, rule })) return out;
      appendOccurrence({ out, nominalDate, window, policy: rule.adjustment });
    }
  }
  return out.sort((a, b) => a.nominalDate.localeCompare(b.nominalDate));
};

export function expandRecurrenceDates(rule: RecurrenceRule, fromDate: string, toDate: string): ExpandedOccurrence[] {
  const window = { fromDate, toDate };
  validateExpansion({ rule, window });
  if (rule.kind === "once") return expandOnce({ rule, window });
  positive({ value: rule.occurrenceCount, name: "occurrenceCount" });
  if (rule.kind === "weekly") return expandWeekly({ rule, window });
  if (rule.kind === "annual") return expandAnnual({ rule, window });
  return expandMonthly({ rule, window });
}
export const expandRecurrence = (rule: RecurrenceRule, fromDate: string, toDate: string): string[] => expandRecurrenceDates(rule, fromDate, toDate).map((item) => item.adjustedDate);

export type AccountKind = "asset" | "liability";
export type Direction = "inflow" | "outflow" | "either";
export type SourceClass = "owner_confirmed" | "statement_supported" | "debt_requirement" | "detected_mature" | "expected_income" | "repeated_discretionary";
export type AmountModel = { kind: "exact"; amountCents: number } | { kind: "approximate"; centerCents: number; toleranceCents?: number; toleranceBps?: number } | { kind: "range"; minimumCents: number; maximumCents: number } | { kind: "empirical"; medianCents: number; minimumCents?: number; maximumCents?: number };
export interface PublicSchedule { scheduleId: string; revision: number; accountId: string; currency: string; direction: Direction; flowKind: string; merchant?: string | null; sourceClass: SourceClass; status: "active" | "candidate" | "retired"; authority: "owner" | "statement" | "model"; recurrence?: RecurrenceRule; amountModel: AmountModel; scenario?: { committed?: boolean; expected?: boolean; possible?: boolean }; }
export interface PublicOccurrence { occurrenceId: string; scheduleId: string; scheduleRevision: number; accountId: string; currency: string; direction: Direction; flowKind: string; expectedDate: string; postponedToDate?: string; amount: { expectedCents: number; lowCents: number; highCents: number }; sourceClass: SourceClass; state: "expected" | "due" | "postponed" | "settled" | "cancelled"; scenarioEligible: { committed: boolean; expected: boolean; possible: boolean }; }
export interface PendingExposure { exposureId: string; accountId: string; currency: string; direction: Direction; amountCents: number; lowCents?: number; highCents?: number; expectedDate?: string; eligible?: boolean; replacedByActualId?: string | null; }
export interface ForecastInput { accountId: string; currency: string; accountKind: AccountKind; cutoffDate: string; startingBalanceCents?: number | null; reserveCents?: number; schedules: PublicSchedule[]; occurrences: PublicOccurrence[]; pendingExposure?: PendingExposure[]; warnings?: string[]; }
export interface ForecastComponent { componentId: string; kind: "schedule" | "pending"; occurrenceId?: string; sourceId?: string; date: string; direction: Direction; expectedCents: number; lowCents: number; highCents: number; scenario: "committed" | "expected" | "possible_low" | "possible_high"; }
export interface ForecastDay { date: string; committedBalanceCents: number; expectedBalanceCents: number; possibleLowBalanceCents: number; possibleHighBalanceCents: number; components: ForecastComponent[]; }
export interface ForecastResult { accountId: string; currency: string; accountKind: AccountKind; cutoffDate: string; horizons: number[]; days: ForecastDay[]; firstUnsafeDate: Record<"committed" | "expected" | "possible_low" | "possible_high", string | null>; unsafeThresholdCents: number; warnings: string[]; abstained: boolean; inputDigest: string; outputDigest: string; }

const moneyCurrency = (currency: string): string => { const value = currency.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(value)) throw new Error("Currency must be an ISO-style 3-letter code"); return value; };
const delta = (kind: AccountKind, direction: Direction, cents: number): number => { if (direction === "either") throw new Error("Either-direction forecast is not allowed"); const sign = direction === "inflow" ? 1 : -1; return kind === "asset" ? sign * cents : -sign * cents; };
const scenarioDeltas = ({ accountKind, direction, lowCents, highCents }: {
  accountKind: AccountKind;
  direction: Direction;
  lowCents: number;
  highCents: number;
}): { low: number; high: number } => {
  const first = delta(accountKind, direction, lowCents);
  const second = delta(accountKind, direction, highCents);
  return { low: Math.min(first, second), high: Math.max(first, second) };
};
const canonical = (value: unknown): string => { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; };
export const deterministicDigest = (value: unknown): string => { const text = canonical(value); let a = 0x811c9dc5; let b = 0x9e3779b9; for (let i = 0; i < text.length; i += 1) { a = Math.imul(a ^ text.charCodeAt(i), 0x01000193); b = Math.imul(b ^ (text.charCodeAt(i) + i), 0x85ebca6b); } return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`; };
const dateRange = ({ from, days }: { from: string; days: number }): string[] =>
  Array.from({ length: days }, (_, index) => addDays({ date: from, days: index + 1 }));
const amountFrom = (model: AmountModel): { expectedCents: number; lowCents: number; highCents: number } => {
  if (model.kind === "exact") return { expectedCents: model.amountCents, lowCents: model.amountCents, highCents: model.amountCents };
  if (model.kind === "approximate") { const tolerance = model.toleranceCents ?? Math.round(model.centerCents * (model.toleranceBps ?? 0) / 10_000); return { expectedCents: model.centerCents, lowCents: Math.max(0, model.centerCents - tolerance), highCents: model.centerCents + tolerance }; }
  if (model.kind === "range") return { expectedCents: model.minimumCents + Math.round((model.maximumCents - model.minimumCents) / 2), lowCents: model.minimumCents, highCents: model.maximumCents };
  return { expectedCents: model.medianCents, lowCents: model.minimumCents ?? model.medianCents, highCents: model.maximumCents ?? model.medianCents };
};
const committed = (source: SourceClass, flags?: PublicOccurrence["scenarioEligible"]): boolean => flags?.committed ?? ["owner_confirmed", "statement_supported", "debt_requirement"].includes(source);
const expected = (source: SourceClass, flags?: PublicOccurrence["scenarioEligible"]): boolean => flags?.expected ?? (committed(source, flags) || ["detected_mature", "expected_income"].includes(source));

export function materializeSchedule(schedule: PublicSchedule, fromDate: string, toDate: string): PublicOccurrence[] {
  if (schedule.status !== "active" || !schedule.recurrence) return [];
  const eligibility = { committed: schedule.scenario?.committed ?? ["owner_confirmed", "statement_supported", "debt_requirement"].includes(schedule.sourceClass), expected: schedule.scenario?.expected ?? (committed(schedule.sourceClass) || ["detected_mature", "expected_income"].includes(schedule.sourceClass)), possible: schedule.scenario?.possible ?? true };
  const amount = amountFrom(schedule.amountModel);
  return expandRecurrenceDates(schedule.recurrence, fromDate, toDate).map((item) => ({ occurrenceId: `occurrence_${deterministicDigest([schedule.scheduleId, schedule.revision, item.nominalDate])}`, scheduleId: schedule.scheduleId, scheduleRevision: schedule.revision, accountId: schedule.accountId, currency: moneyCurrency(schedule.currency), direction: schedule.direction, flowKind: schedule.flowKind, expectedDate: item.adjustedDate, amount, sourceClass: schedule.sourceClass, state: "expected", scenarioEligible: eligibility }));
}

interface ForecastBalances { committed: number; expected: number; low: number; high: number }

const normalizedHorizons = (horizons: number[]): number[] => {
  const values = [...new Set(horizons)]
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (!values.length) throw new Error("At least one positive horizon is required");
  return values;
};

const abstainedForecast = ({ input, currency, horizons, threshold, inputDigest }: {
  input: ForecastInput;
  currency: string;
  horizons: number[];
  threshold: number;
  inputDigest: string;
}): ForecastResult => {
  const base = {
    accountId: input.accountId,
    currency,
    accountKind: input.accountKind,
    cutoffDate: input.cutoffDate,
    horizons,
    days: [],
    firstUnsafeDate: { committed: null, expected: null, possible_low: null, possible_high: null },
    unsafeThresholdCents: threshold,
    warnings: [...new Set([...(input.warnings ?? []), "starting_balance_missing"])].sort(),
    abstained: true,
    inputDigest,
  };
  return { ...base, outputDigest: deterministicDigest(base) };
};

const activeScheduleRevisions = ({ input, currency }: { input: ForecastInput; currency: string }): Map<string, number> =>
  new Map(input.schedules
    .filter((schedule) => schedule.status === "active")
    .filter((schedule) => schedule.accountId === input.accountId)
    .filter((schedule) => moneyCurrency(schedule.currency) === currency)
    .map((schedule) => [schedule.scheduleId, schedule.revision]));

const forecastOccurrences = ({ input, currency }: { input: ForecastInput; currency: string }): PublicOccurrence[] => {
  const active = activeScheduleRevisions({ input, currency });
  return input.occurrences
    .filter((occurrence) => occurrence.accountId === input.accountId)
    .filter((occurrence) => moneyCurrency(occurrence.currency) === currency)
    .filter((occurrence) => active.get(occurrence.scheduleId) === occurrence.scheduleRevision);
};

const occurrenceApplies = ({ occurrence, date }: { occurrence: PublicOccurrence; date: string }): boolean => {
  if (!["expected", "due", "postponed"].includes(occurrence.state)) return false;
  if ((occurrence.postponedToDate ?? occurrence.expectedDate) !== date) return false;
  return occurrence.direction !== "either";
};

const occurrenceComponent = ({ occurrence, date, scenario }: {
  occurrence: PublicOccurrence;
  date: string;
  scenario: ForecastComponent["scenario"];
}): ForecastComponent => ({
  componentId: `occurrence:${occurrence.occurrenceId}:${scenario}`,
  kind: "schedule",
  occurrenceId: occurrence.occurrenceId,
  date,
  direction: occurrence.direction,
  expectedCents: occurrence.amount.expectedCents,
  lowCents: occurrence.amount.lowCents,
  highCents: occurrence.amount.highCents,
  scenario,
});

const possibleOccurrence = (occurrence: PublicOccurrence): boolean => {
  if (occurrence.scenarioEligible.possible) return true;
  if (committed(occurrence.sourceClass, occurrence.scenarioEligible)) return true;
  return expected(occurrence.sourceClass, occurrence.scenarioEligible);
};

const applyOccurrence = ({ occurrence, date, accountKind, balances, components }: {
  occurrence: PublicOccurrence;
  date: string;
  accountKind: AccountKind;
  balances: ForecastBalances;
  components: ForecastComponent[];
}): void => {
  if (!occurrenceApplies({ occurrence, date })) return;
  if (committed(occurrence.sourceClass, occurrence.scenarioEligible)) {
    const component = occurrenceComponent({ occurrence, date, scenario: "committed" });
    components.push(component);
    balances.committed += delta(accountKind, occurrence.direction, component.expectedCents);
  }
  if (expected(occurrence.sourceClass, occurrence.scenarioEligible)) {
    const component = occurrenceComponent({ occurrence, date, scenario: "expected" });
    components.push(component);
    balances.expected += delta(accountKind, occurrence.direction, component.expectedCents);
  }
  if (!possibleOccurrence(occurrence)) return;
  const low = occurrenceComponent({ occurrence, date, scenario: "possible_low" });
  const high = occurrenceComponent({ occurrence, date, scenario: "possible_high" });
  const deltas = scenarioDeltas({
    accountKind,
    direction: occurrence.direction,
    lowCents: low.lowCents,
    highCents: high.highCents,
  });
  components.push(low, high);
  balances.low += deltas.low;
  balances.high += deltas.high;
};

const pendingApplies = ({ pending, input, currency, date }: {
  pending: PendingExposure;
  input: ForecastInput;
  currency: string;
  date: string;
}): boolean => {
  if (!pending.eligible) return false;
  if (pending.replacedByActualId) return false;
  if (pending.accountId !== input.accountId) return false;
  if (moneyCurrency(pending.currency) !== currency) return false;
  const expectedDate = pending.expectedDate ?? addDays({ date: input.cutoffDate, days: 1 });
  if (expectedDate !== date) return false;
  return pending.direction !== "either";
};

const applyPending = ({ pending, input, currency, date, balances, components }: {
  pending: PendingExposure;
  input: ForecastInput;
  currency: string;
  date: string;
  balances: ForecastBalances;
  components: ForecastComponent[];
}): void => {
  if (!pendingApplies({ pending, input, currency, date })) return;
  const low: ForecastComponent = {
    componentId: `pending:${pending.exposureId}:low`,
    kind: "pending",
    sourceId: pending.exposureId,
    date,
    direction: pending.direction,
    expectedCents: pending.amountCents,
    lowCents: pending.lowCents ?? pending.amountCents,
    highCents: pending.highCents ?? pending.amountCents,
    scenario: "possible_low",
  };
  const high = { ...low, componentId: `pending:${pending.exposureId}:high`, scenario: "possible_high" as const };
  const deltas = scenarioDeltas({
    accountKind: input.accountKind,
    direction: pending.direction,
    lowCents: low.lowCents,
    highCents: high.highCents,
  });
  components.push(low, high);
  balances.low += deltas.low;
  balances.high += deltas.high;
};

const firstUnsafeDates = ({ days, threshold }: { days: ForecastDay[]; threshold: number }): ForecastResult["firstUnsafeDate"] => ({
  committed: days.find((day) => day.committedBalanceCents < threshold)?.date ?? null,
  expected: days.find((day) => day.expectedBalanceCents < threshold)?.date ?? null,
  possible_low: days.find((day) => day.possibleLowBalanceCents < threshold)?.date ?? null,
  possible_high: days.find((day) => day.possibleHighBalanceCents < threshold)?.date ?? null,
});

export function projectForecast(input: ForecastInput, horizons = [30, 60, 90]): ForecastResult {
  const currency = moneyCurrency(input.currency);
  const hs = normalizedHorizons(horizons);
  const threshold = input.reserveCents ?? 0;
  const inputDigest = deterministicDigest(input);
  if (input.startingBalanceCents == null) {
    return abstainedForecast({ input, currency, horizons: hs, threshold, inputDigest });
  }
  const occurrences = forecastOccurrences({ input, currency });
  const balances = {
    committed: input.startingBalanceCents,
    expected: input.startingBalanceCents,
    low: input.startingBalanceCents,
    high: input.startingBalanceCents,
  };
  const days: ForecastDay[] = [];
  for (const date of dateRange({ from: input.cutoffDate, days: hs.at(-1)! })) {
    const components: ForecastComponent[] = [];
    for (const occurrence of occurrences) {
      applyOccurrence({ occurrence, date, accountKind: input.accountKind, balances, components });
    }
    for (const pending of input.pendingExposure ?? []) {
      applyPending({ pending, input, currency, date, balances, components });
    }
    days.push({ date, committedBalanceCents: balances.committed, expectedBalanceCents: balances.expected, possibleLowBalanceCents: balances.low, possibleHighBalanceCents: balances.high, components: components.sort((a, b) => a.componentId.localeCompare(b.componentId)) });
  }
  const warnings = [...new Set(input.warnings ?? [])].sort();
  const firstUnsafeDate = firstUnsafeDates({ days, threshold });
  const base = { accountId: input.accountId, currency, accountKind: input.accountKind, cutoffDate: input.cutoffDate, horizons: hs, days, firstUnsafeDate, unsafeThresholdCents: threshold, warnings, abstained: false, inputDigest };
  return { ...base, outputDigest: deterministicDigest(base) };
}

export interface BacktestOrigin { originId: string; originDate: string; forecastInput: ForecastInput; actualBalances: Array<{ date: string; balanceCents: number }>; }
export interface BacktestMetrics { horizonDays: number; sampleCount: number; balanceMaeCents: number | null; rangeCoverage: number | null; intervalWidthCents: number | null; baselineMaeCents: number | null; }
export interface BacktestResult { engineVersion: "wave4-public-backtest-v1"; horizons: number[]; originCount: number; evaluatedOriginCount: number; excludedOriginCount: number; metrics: BacktestMetrics[]; exclusions: Array<{ originId: string; reason: string }>; digest: string; }
const mean = (values: number[]): number | null => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
interface BacktestRow { actual: number; predicted: number; low: number; high: number; baseline: number }
interface BacktestState {
  rows: Map<number, BacktestRow[]>;
  exclusions: BacktestResult["exclusions"];
  evaluated: Set<string>;
}

const validBacktestOrigin = (origin: BacktestOrigin): boolean => {
  if (origin.forecastInput.cutoffDate !== origin.originDate) return false;
  return origin.forecastInput.startingBalanceCents != null;
};

const evaluateOrigin = ({ origin, horizons, state }: {
  origin: BacktestOrigin;
  horizons: number[];
  state: BacktestState;
}): void => {
  if (!validBacktestOrigin(origin)) {
    state.exclusions.push({ originId: origin.originId, reason: "origin requires cutoff-aligned starting balance" });
    return;
  }
  const forecast = projectForecast(origin.forecastInput, horizons);
  const actual = new Map(origin.actualBalances.map((balance) => [balance.date, balance.balanceCents]));
  for (const horizon of horizons) {
    const date = addDays({ date: origin.originDate, days: horizon });
    const day = forecast.days.find((candidate) => candidate.date === date);
    const balance = actual.get(date);
    if (!day || balance == null) {
      state.exclusions.push({ originId: `${origin.originId}@${horizon}d`, reason: `no matured balance at ${date}` });
      continue;
    }
    state.rows.get(horizon)!.push({
      actual: balance,
      predicted: day.expectedBalanceCents,
      low: day.possibleLowBalanceCents,
      high: day.possibleHighBalanceCents,
      baseline: origin.forecastInput.startingBalanceCents!,
    });
    state.evaluated.add(origin.originId);
  }
};

const metricsFor = ({ horizonDays, values }: { horizonDays: number; values: BacktestRow[] }): BacktestMetrics => ({
  horizonDays,
  sampleCount: values.length,
  balanceMaeCents: mean(values.map((row) => Math.abs(row.predicted - row.actual))),
  rangeCoverage: values.length
    ? values.filter((row) => row.actual >= row.low && row.actual <= row.high).length / values.length
    : null,
  intervalWidthCents: mean(values.map((row) => row.high - row.low)),
  baselineMaeCents: mean(values.map((row) => Math.abs(row.baseline - row.actual))),
});

export function backtestForecast(origins: BacktestOrigin[], horizons = [7, 30, 60, 90]): BacktestResult {
  const hs = normalizedHorizons(horizons);
  const state: BacktestState = {
    rows: new Map(hs.map((horizon) => [horizon, []])),
    exclusions: [],
    evaluated: new Set(),
  };
  const sortedOrigins = [...origins]
    .sort((first, second) => first.originDate.localeCompare(second.originDate) || first.originId.localeCompare(second.originId));
  for (const origin of sortedOrigins) evaluateOrigin({ origin, horizons: hs, state });
  const metrics = hs.map((horizon) => metricsFor({ horizonDays: horizon, values: state.rows.get(horizon)! }));
  const base = {
    engineVersion: "wave4-public-backtest-v1" as const,
    horizons: hs,
    originCount: origins.length,
    evaluatedOriginCount: state.evaluated.size,
    excludedOriginCount: new Set(state.exclusions.map((item) => item.originId.split("@")[0])).size,
    metrics,
    exclusions: state.exclusions,
  };
  return { ...base, digest: deterministicDigest(base) };
}

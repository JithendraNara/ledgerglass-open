import type { Env, SimpleFinPayload, SimpleFinTransaction } from "./types.js";

export const ACCESS_URL_KV_KEY = "simplefin:access-url:v1";
const SIMPLEFIN_TIMEOUT_MS = 20_000;
const SIMPLEFIN_MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const DEFAULT_SIMPLEFIN_HOSTS = ["bridge.simplefin.org", "beta-bridge.simplefin.org"];

export async function claimSetupToken(setupToken: string, allowedHosts = DEFAULT_SIMPLEFIN_HOSTS): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);
  assertSafeHttpsUrl(claimUrl, "SimpleFIN claim URL", allowedHosts);

  const response = await fetch(claimUrl, {
    method: "POST",
    headers: {
      "content-length": "0",
      "user-agent": "ledgerglass-open/0.1.0"
    },
    signal: AbortSignal.timeout(SIMPLEFIN_TIMEOUT_MS),
  });

  const body = await readBoundedText(response, SIMPLEFIN_MAX_RESPONSE_BYTES);
  if (response.status === 403) {
    throw new Error("SimpleFIN setup token was rejected or already claimed");
  }
  if (!response.ok) {
    throw new Error(`SimpleFIN claim failed with HTTP ${response.status}`);
  }
  const accessUrl = body.trim();
  assertSafeHttpsUrl(accessUrl, "SimpleFIN Access URL", allowedHosts);
  return accessUrl;
}

export async function claimAndStoreSetupToken(env: Env, setupToken: string): Promise<string> {
  const accessUrl = await claimSetupToken(setupToken, allowedSimpleFinHosts(env));
  await env.CONFIG_KV.put(ACCESS_URL_KV_KEY, accessUrl);
  return accessUrl;
}

export async function resolveAccessUrl(env: Env): Promise<string> {
  const accessUrl = env.SIMPLEFIN_ACCESS_URL?.trim()
    || await env.CONFIG_KV.get(ACCESS_URL_KV_KEY);
  if (!accessUrl) {
    throw new Error("SimpleFIN Access URL is not configured; set the secret or claim a setup token");
  }
  assertSafeHttpsUrl(accessUrl, "SimpleFIN Access URL", allowedSimpleFinHosts(env));
  return accessUrl;
}

export async function fetchSimpleFinAccounts(
  accessUrl: string,
  options: { startDate?: string; endDate?: string; pending?: boolean; accountIds?: string[]; balancesOnly?: boolean }
): Promise<SimpleFinPayload> {
  const url = new URL(`${accessUrl.replace(/\/+$/, "")}/accounts`);
  const authorization = basicAuthHeader(url);
  url.searchParams.set("version", "2");

  if (options.startDate) url.searchParams.set("start-date", dateToEpoch(options.startDate));
  if (options.endDate) url.searchParams.set("end-date", dateToEpochExclusiveEnd(options.endDate));
  if (options.pending) url.searchParams.set("pending", "1");
  if (options.balancesOnly) url.searchParams.set("balances-only", "1");
  for (const accountId of options.accountIds ?? []) {
    url.searchParams.append("account", accountId);
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(authorization ? { authorization } : {}),
      "user-agent": "ledgerglass-open/0.1.0"
    },
    signal: AbortSignal.timeout(SIMPLEFIN_TIMEOUT_MS),
  });

  const text = await readBoundedText(response, SIMPLEFIN_MAX_RESPONSE_BYTES);

  if (response.status === 403) {
    throw new Error("SimpleFIN access was rejected or revoked");
  }
  if (!response.ok) {
    throw new Error(`SimpleFIN returned HTTP ${response.status}`);
  }

  const payload = text ? safeJson(text) : {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("SimpleFIN returned invalid JSON");
  }

  const normalized = payload as SimpleFinPayload;
  normalized.errlist = sanitizeErrlist(normalized.errlist ?? normalized.errors);
  normalized.errors = normalized.errlist;
  return normalized;
}

export function transactionPostedAt(transaction: SimpleFinTransaction): number | null {
  return transaction.posted_at ?? transaction.posted ?? null;
}

export function transactionTransactedAt(transaction: SimpleFinTransaction): number | null {
  return transaction.transacted_at ?? transaction.transacted ?? null;
}

export function transactionAmount(transaction: SimpleFinTransaction): number {
  return toNumber(transaction.amount);
}

export async function stableTransactionId(accountId: string, transaction: SimpleFinTransaction, duplicateOrdinal = 0): Promise<string> {
  if (transaction.id) return `${accountId}:${transaction.id}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fallbackTransactionFingerprint(accountId, transaction)),
  );
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${accountId}:fallback:${hex}:${duplicateOrdinal}`;
}

export function fallbackTransactionFingerprint(accountId: string, transaction: SimpleFinTransaction): string {
  return JSON.stringify([
    accountId,
    transactionPostedAt(transaction) ?? transactionTransactedAt(transaction) ?? null,
    transaction.amount,
    transaction.description ?? null,
    transaction.payee ?? null,
    transaction.memo ?? null,
  ]);
}

export function dateToEpoch(value: string): string {
  return String(dateToEpochSeconds(value));
}

// SimpleFIN end-date is exclusive. Public inputs are human-inclusive dates.
export function dateToEpochExclusiveEnd(value: string): string {
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return String(Math.floor(date.getTime() / 1000));
}

export function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nullableNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeSetupToken(setupToken: string): string {
  try {
    return atob(setupToken.trim());
  } catch {
    throw new Error("SimpleFIN setup token is not valid base64");
  }
}

export function sanitizeText(value: unknown, maxLength = 300): string {
  if (typeof value !== "string") return "";
  let cleaned = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : character;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

export function sanitizeErrlist(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((entry) => {
    const source = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const output: Record<string, unknown> = {
      code: sanitizeText(source.code, 40) || "gen.",
      msg: sanitizeText(source.msg, 300),
    };
    if (typeof source.conn_id === "string") output.conn_id = sanitizeText(source.conn_id, 120);
    if (typeof source.account_id === "string") output.account_id = sanitizeText(source.account_id, 120);
    return output;
  });
}

function basicAuthHeader(url: URL): string | undefined {
  if (!url.username && !url.password) return undefined;
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = "";
  url.password = "";
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("SimpleFIN returned malformed JSON");
  }
}

function dateToEpochSeconds(value: string): number {
  return Math.floor(parseCalendarDate(value).getTime() / 1000);
}

function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid calendar date: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

function allowedSimpleFinHosts(env: Env): string[] {
  const configured = env.SIMPLEFIN_ALLOWED_HOSTS?.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_SIMPLEFIN_HOSTS;
}

function assertSafeHttpsUrl(value: string, label: string, allowedHosts?: string[]): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":")
    || /^127\./.test(host) || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error(`${label} must not target a local or private address`);
  }
  if (allowedHosts && !allowedHosts.includes(host)) {
    throw new Error(`${label} host is not in SIMPLEFIN_ALLOWED_HOSTS`);
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("SimpleFIN response exceeded the maximum allowed size");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("SimpleFIN response exceeded the maximum allowed size");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

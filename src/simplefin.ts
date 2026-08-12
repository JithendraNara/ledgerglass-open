export type SimpleFinTransaction = {
  id?: string;
  amount: string;
  description?: string;
  payee?: string;
  memo?: string;
  posted?: number;
  transacted?: number;
  transacted_at?: number;
  posted_at?: number;
  pending?: boolean;
  [key: string]: unknown;
};

export type SimpleFinAccount = {
  id: string;
  name?: string;
  org?: {
    name?: string;
    domain?: string;
    "sfin-url"?: string;
    [key: string]: unknown;
  };
  balance?: string;
  "available-balance"?: string;
  currency?: string;
  transactions?: SimpleFinTransaction[];
  [key: string]: unknown;
};

export type SimpleFinAccountsResponse = {
  accounts?: SimpleFinAccount[];
  errors?: unknown[];
  errlist?: unknown[];
  [key: string]: unknown;
};

export type FetchAccountsOptions = {
  startDate?: string;
  endDate?: string;
  pending?: boolean;
};

export class SimpleFinClient {
  constructor(
    private readonly accessUrl: string | undefined,
    private readonly allowedHosts: string[] = ["bridge.simplefin.org", "beta-bridge.simplefin.org"],
  ) {}

  isConfigured(): boolean {
    return Boolean(this.accessUrl);
  }

  async fetchAccounts(options: FetchAccountsOptions = {}): Promise<SimpleFinAccountsResponse> {
    if (!this.accessUrl) {
      throw new Error("SIMPLEFIN_ACCESS_URL is not configured yet");
    }

    const url = new URL(joinUrl(this.accessUrl, "accounts"));
    assertSafeAccessUrl(url, this.allowedHosts);
    const authorization = basicAuthHeader(url);
    url.searchParams.set("version", "2");

    if (options.startDate) url.searchParams.set("start-date", dateToEpoch(options.startDate));
    if (options.endDate) url.searchParams.set("end-date", dateToEpochExclusiveEnd(options.endDate));
    if (options.pending) url.searchParams.set("pending", "1");

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(authorization ? { authorization } : {}),
        "user-agent": "ledgerglass-starter/0.1.0"
      },
      signal: AbortSignal.timeout(20_000)
    });

    const text = await readBoundedText(response, 12 * 1024 * 1024);

    if (!response.ok) {
      throw new Error(`SimpleFIN returned HTTP ${response.status}`);
    }

    const payload = parseJson(text);
    return payload as SimpleFinAccountsResponse;
  }
}

export function normalizeAccounts(payload: SimpleFinAccountsResponse): SimpleFinAccount[] {
  if (!Array.isArray(payload.accounts)) return [];
  return payload.accounts.filter((account): account is SimpleFinAccount => typeof account.id === "string");
}

export function collectTransactions(
  accounts: SimpleFinAccount[],
  accountId?: string
): Array<SimpleFinTransaction & { account_id: string; account_name?: string; org_name?: string }> {
  return accounts
    .filter((account) => !accountId || account.id === accountId)
    .flatMap((account) =>
      (account.transactions ?? []).map((transaction) => ({
        ...transaction,
        account_id: account.id,
        account_name: account.name,
        org_name: account.org?.name
      }))
    );
}

export function toNumber(amount: string | undefined): number {
  if (!amount) return 0;
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function basicAuthHeader(url: URL): string | undefined {
  if (!url.username && !url.password) return undefined;
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = "";
  url.password = "";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function dateToEpoch(value: string): string {
  return String(Math.floor(parseCalendarDate(value).getTime() / 1000));
}

export function dateToEpochExclusiveEnd(value: string): string {
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return String(Math.floor(date.getTime() / 1000));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("SimpleFIN returned malformed JSON");
  }
}

function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid calendar date: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

function assertSafeAccessUrl(url: URL, allowedHosts: string[]): void {
  if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error("SimpleFIN Access URL must use HTTPS and an allowed hostname");
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error("SimpleFIN response exceeded the maximum allowed size");
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

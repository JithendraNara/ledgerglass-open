import { createMcpHandler, type StatelessMcpHandler } from "agents/mcp/server";
import { authorizeAdmin, authorizeMcp } from "./auth.js";
import { errorJson, json, parseNumber } from "./http.js";
import { createFinanceMcpServer } from "./mcp.js";
import { FinanceRepository } from "./repository.js";
import { ManualSyncRateLimitError, syncSimpleFin } from "./sync.js";
import { saveMcpEvent } from "./telemetry.js";
import type { Env, ToolAuth } from "./types.js";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export async function handleFinanceMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = await authorizeMcp(request, env);
  if (auth instanceof Response) return auth;

  const startedAt = performance.now();
  const operation = await safeMcpOperation(request);
  const response = await createFinanceMcpHttpHandler(env, auth)(request, env, ctx);
  return instrumentMcpResponse(response, { env, ctx, operation, auth, startedAt });
}

export function createFinanceMcpHttpHandler(
  env: Env,
  auth: ToolAuth,
): StatelessMcpHandler {
  const allowedHostnames = [...LOCAL_HOSTS, ...(env.MCP_HOSTNAME ? [env.MCP_HOSTNAME] : [])];
  const allowedOriginHostnames = [
    ...LOCAL_HOSTS,
    ...(env.MCP_ALLOWED_ORIGIN ? [new URL(env.MCP_ALLOWED_ORIGIN).hostname] : []),
  ];
  return createMcpHandler(
    () => createFinanceMcpServer(env, auth),
    {
      route: "/mcp",
      legacy: "stateless",
      allowedHostnames,
      allowedOriginHostnames,
    },
  );
}

export async function handleOperationalRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok: true, service: "ledgerglass-open" });
  }

  if (url.pathname === "/ready") {
    const operational = await new FinanceRepository(env).operationalStatus();
    const readiness = operational.readiness as { ready?: boolean; degraded?: boolean };
    return json({
      service: "ledgerglass-open",
      ready: Boolean(readiness.ready),
      degraded: Boolean(readiness.degraded),
    }, readiness.ready ? 200 : 503);
  }

  if (url.pathname === "/admin/sync" && request.method === "POST") {
    const unauthorized = await authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
    const body = await readJsonBody(request);
    const requestedDays = url.searchParams.get("days");
    try {
      return json(await syncSimpleFin(env, {
        startDate: stringValue(body.startDate) ?? url.searchParams.get("startDate") ?? undefined,
        endDate: stringValue(body.endDate) ?? url.searchParams.get("endDate") ?? undefined,
        days: requestedDays
          ? parseNumber(requestedDays, 1, 1, 90)
          : typeof body.days === "number" ? body.days : undefined,
        pending: typeof body.pending === "boolean" ? body.pending : url.searchParams.get("pending") !== "0",
        force: body.force === true || url.searchParams.get("force") === "1",
        trigger: "manual",
      }));
    } catch (error) {
      if (error instanceof ManualSyncRateLimitError) {
        return errorJson(error.message, 429, { code: "manual_sync_rate_limit" });
      }
      throw error;
    }
  }

  if (url.pathname === "/admin/debug/accounts") {
    const unauthorized = await authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
    return json(await new FinanceRepository(env).listAccounts());
  }

  if (url.pathname === "/admin/debug/transactions") {
    const unauthorized = await authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
    const transactions = await new FinanceRepository(env).getTransactions({
      accountId: url.searchParams.get("account_id") ?? undefined,
      limit: parseNumber(url.searchParams.get("limit"), 200, 1, 1000),
    });
    return json({ transactions, count: transactions.length });
  }

  if (url.pathname === "/admin/debug/events") {
    const unauthorized = await authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
    return json(await new FinanceRepository(env).operationalEvents({
      limit: parseNumber(url.searchParams.get("limit"), 50, 1, 200),
    }));
  }

  return errorJson("not_found", 404);
}

function instrumentMcpResponse(response: Response, data: {
  env: Env;
  ctx: ExecutionContext;
  operation: string;
  auth: ToolAuth;
  startedAt: number;
}): Response {
  if (!response.body) {
    data.ctx.waitUntil(recordMcpEvent(data, response.status));
    return response;
  }
  const reader = response.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        data.ctx.waitUntil(recordMcpEvent(data, response.status));
        controller.close();
        return;
      }
      controller.enqueue(chunk.value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
      data.ctx.waitUntil(recordMcpEvent(data, response.status));
    },
  });
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function recordMcpEvent(data: {
  env: Env;
  operation: string;
  auth: ToolAuth;
  startedAt: number;
}, status: number): Promise<void> {
  return saveMcpEvent(data.env, {
    operation: data.operation,
    auth: data.auth,
    status,
    durationMs: Math.max(1, Math.round(performance.now() - data.startedAt)),
  });
}

async function safeMcpOperation(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32_768 || !request.headers.get("content-type")?.includes("application/json")) {
    return "unknown";
  }
  try {
    const body = await request.clone().json() as { method?: unknown; params?: { name?: unknown } };
    if (body.method === "tools/call" && typeof body.params?.name === "string") {
      return `tools/call:${body.params.name}`;
    }
    return typeof body.method === "string" ? body.method : "unknown";
  } catch {
    return "unknown";
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

import { errorJson } from "./http.js";
import { handleFinanceMcpRequest, handleOperationalRequest } from "./mcp-http.js";
import { syncSimpleFin } from "./sync.js";
import { purgeOperationalEvents, saveHttpEvent, saveScheduledSyncEvent, saveWorkerErrorEvent } from "./telemetry.js";
import type { Env } from "./types.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startedAt = performance.now();
    const url = new URL(request.url);
    try {
      const response = url.pathname === "/mcp"
        ? await handleFinanceMcpRequest(request, env, ctx)
        : await handleOperationalRequest(request, env);
      if (shouldAuditHttp(url.pathname, response.status)) {
        ctx.waitUntil(saveHttpEvent(env, {
          path: url.pathname,
          method: request.method,
          status: response.status,
          durationMs: elapsedMs(startedAt),
        }));
      }
      return response;
    } catch (error) {
      ctx.waitUntil(saveWorkerErrorEvent(env, {
        path: url.pathname,
        method: request.method,
        durationMs: elapsedMs(startedAt),
        error,
      }));
      return errorJson("internal_error", 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledSync(env));
    ctx.waitUntil(purgeOperationalEvents(env));
  },
} satisfies ExportedHandler<Env>;

async function runScheduledSync(env: Env): Promise<void> {
  const startedAt = performance.now();
  try {
    const result = await syncSimpleFin(env, { trigger: "scheduled", pending: true });
    await saveScheduledSyncEvent(env, { status: "ok", durationMs: elapsedMs(startedAt), result });
  } catch (error) {
    await saveScheduledSyncEvent(env, { status: "error", durationMs: elapsedMs(startedAt), error });
    throw error;
  }
}

function elapsedMs(startedAt: number): number {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

function shouldAuditHttp(path: string, status: number): boolean {
  if (path === "/mcp") return status >= 400;
  return new Set(["/health", "/ready", "/admin/sync", "/admin/debug/accounts", "/admin/debug/transactions", "/admin/debug/events"]).has(path);
}

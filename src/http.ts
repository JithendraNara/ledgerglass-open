import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response, NextFunction } from "express";
import { Config } from "./config.js";
import { createServer } from "./server.js";

export function startHttpServer(config: Config): void {
  if (!isLoopbackHost(config.host) && !config.bearerToken) {
    throw new Error("A bearer token is required when binding the local adapter beyond loopback");
  }
  const app = createMcpExpressApp({ host: config.host });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!config.bearerToken) {
      next();
      return;
    }

    const expected = `Bearer ${config.bearerToken}`;
    if (req.header("authorization") !== expected) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    next();
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "ledgerglass-starter"
    });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const mcp = createServer(config);

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });

      await mcp.server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        transport.close();
        mcp.close();
      });
    } catch {
      console.error("MCP request failed");

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  app.all("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed"
      },
      id: null
    });
  });

  app.listen(config.port, config.host, () => {
    console.error(`ledgerglass-starter listening on http://${config.host}:${config.port}/mcp`);
  });
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

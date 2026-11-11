import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { IpRateLimiter } from "./rate-limit.js";
import { createCaniApplyMcpServer } from "./server.js";

const rateLimiter = new IpRateLimiter(config.MCP_RATE_LIMIT_RPM);

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

/** Express app: GET /health, POST/GET /mcp (stateless Streamable HTTP). */
export function createMcpHttpApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "caniapply-mcp",
      version: "0.1.0",
      ts: new Date().toISOString(),
    });
  });

  app.use("/mcp", (req, res, next) => {
    const ip = clientIp(req);
    if (!rateLimiter.allow(ip)) {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Rate limit exceeded (60 req/min)" },
        id: null,
      });
      return;
    }
    next();
  });

  const handleMcp = async (req: Request, res: Response) => {
    const server = createCaniApplyMcpServer(db);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error(
        "[mcp:http] error:",
        err instanceof Error ? err.message : err,
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  };

  app.post("/mcp", (req, res) => void handleMcp(req, res));
  app.get("/mcp", (req, res) => void handleMcp(req, res));
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  return app;
}

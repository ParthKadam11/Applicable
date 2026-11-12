import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { getDailyStatsHistory } from "../stats/daily.js";
import { IpRateLimiter } from "./rate-limit.js";
import { createCaniApplyMcpServer } from "./server.js";
import { getMcpStats } from "./tools.js";

const rateLimiter = new IpRateLimiter(config.MCP_RATE_LIMIT_RPM);

const STATS_CACHE_TTL_MS = 5 * 60_000;
const LANDING_ORIGIN = "https://caniapply.parthkadam.tech";

type CacheEntry<T> = { at: number; value: T };
let statsCache: CacheEntry<unknown> | null = null;
let historyCache: CacheEntry<unknown> | null = null;

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function allowCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin === LANDING_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", LANDING_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function cacheControl(): string {
  return `public, max-age=${Math.floor(STATS_CACHE_TTL_MS / 1000)}`;
}

/** Express app: GET /health, /api/stats, /api/stats/history, POST/GET /mcp. */
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

  app.use("/api/stats", allowCors);

  app.get("/api/stats", async (_req, res) => {
    try {
      const now = Date.now();
      if (statsCache && now - statsCache.at < STATS_CACHE_TTL_MS) {
        res.setHeader("Cache-Control", cacheControl());
        res.setHeader("X-Cache", "HIT");
        res.status(200).json(statsCache.value);
        return;
      }
      const value = await getMcpStats(db);
      statsCache = { at: now, value };
      res.setHeader("Cache-Control", cacheControl());
      res.setHeader("X-Cache", "MISS");
      res.status(200).json(value);
    } catch (err) {
      console.error(
        "[api/stats] error:",
        err instanceof Error ? err.message : err,
      );
      res.status(500).json({ ok: false, error: "stats_failed" });
    }
  });

  app.get("/api/stats/history", async (req, res) => {
    try {
      const daysRaw = Number(req.query.days ?? 30);
      const days =
        Number.isFinite(daysRaw) && daysRaw > 0
          ? Math.min(365, Math.floor(daysRaw))
          : 30;
      const now = Date.now();
      const cacheKeyOk =
        historyCache &&
        now - historyCache.at < STATS_CACHE_TTL_MS &&
        (historyCache.value as { days?: number }).days === days;
      if (cacheKeyOk && historyCache) {
        res.setHeader("Cache-Control", cacheControl());
        res.setHeader("X-Cache", "HIT");
        res.status(200).json(historyCache.value);
        return;
      }
      const history = await getDailyStatsHistory(db, days);
      const value = { days, history };
      historyCache = { at: now, value };
      res.setHeader("Cache-Control", cacheControl());
      res.setHeader("X-Cache", "MISS");
      res.status(200).json(value);
    } catch (err) {
      console.error(
        "[api/stats/history] error:",
        err instanceof Error ? err.message : err,
      );
      res.status(500).json({ ok: false, error: "stats_history_failed" });
    }
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

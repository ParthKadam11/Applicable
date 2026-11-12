import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { getDailyStatsHistory } from "../stats/daily.js";
import {
  getPublicJobs,
  getTopCompaniesHiringIndia,
  parseEligibilityParam,
  parseQueryString,
} from "./public-api.js";
import { IpRateLimiter } from "./rate-limit.js";
import { createCaniApplyMcpServer } from "./server.js";
import { getMcpStats } from "./tools.js";

const rateLimiter = new IpRateLimiter(config.MCP_RATE_LIMIT_RPM);

const STATS_CACHE_TTL_MS = 5 * 60_000;
const JOBS_CACHE_TTL_MS = 60_000;

const ALLOWED_ORIGINS = new Set([
  "https://caniapply.parthkadam.tech",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

type CacheEntry<T> = { at: number; value: T; key?: string };
let statsCache: CacheEntry<unknown> | null = null;
let historyCache: CacheEntry<unknown> | null = null;
let topCompaniesCache: CacheEntry<unknown> | null = null;

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function allowCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
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

function cacheControl(ttlMs = STATS_CACHE_TTL_MS): string {
  return `public, max-age=${Math.floor(ttlMs / 1000)}`;
}

/** Express app: health, public /api/*, MCP. */
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

  app.use("/api", allowCors);

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
        historyCache.key === String(days);
      if (cacheKeyOk && historyCache) {
        res.setHeader("Cache-Control", cacheControl());
        res.setHeader("X-Cache", "HIT");
        res.status(200).json(historyCache.value);
        return;
      }
      const history = await getDailyStatsHistory(db, days);
      const value = { days, history };
      historyCache = { at: now, value, key: String(days) };
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

  app.get("/api/jobs", async (req, res) => {
    try {
      const query = parseQueryString(req.query.query);
      const eligibility = parseEligibilityParam(req.query.eligibility);
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const limitRaw = Number(req.query.limit ?? 25);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(50, Math.floor(limitRaw))
          : 25;

      const value = await getPublicJobs(db, {
        query,
        eligibility,
        cursor,
        limit,
      });
      res.setHeader("Cache-Control", cacheControl(JOBS_CACHE_TTL_MS));
      res.status(200).json(value);
    } catch (err) {
      console.error(
        "[api/jobs] error:",
        err instanceof Error ? err.message : err,
      );
      res.status(500).json({ ok: false, error: "jobs_failed" });
    }
  });

  app.get("/api/companies/top", async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 15);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(50, Math.floor(limitRaw))
          : 15;
      const now = Date.now();
      const key = String(limit);
      if (
        topCompaniesCache &&
        now - topCompaniesCache.at < STATS_CACHE_TTL_MS &&
        topCompaniesCache.key === key
      ) {
        res.setHeader("Cache-Control", cacheControl());
        res.setHeader("X-Cache", "HIT");
        res.status(200).json(topCompaniesCache.value);
        return;
      }
      const value = await getTopCompaniesHiringIndia(db, limit);
      topCompaniesCache = { at: now, value, key };
      res.setHeader("Cache-Control", cacheControl());
      res.setHeader("X-Cache", "MISS");
      res.status(200).json(value);
    } catch (err) {
      console.error(
        "[api/companies/top] error:",
        err instanceof Error ? err.message : err,
      );
      res.status(500).json({ ok: false, error: "companies_top_failed" });
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

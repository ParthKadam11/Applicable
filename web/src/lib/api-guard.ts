import { auth } from "@/auth";
import { ipApiLimiter, userSaveLimiter } from "@/lib/rate-limit";

const SITE_ORIGINS = new Set([
  "https://applicable.parthkadam.tech",
  "https://caniapply.parthkadam.tech",
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export function applyMeCors(req: Request, resHeaders: Headers): void {
  const origin = req.headers.get("origin");
  if (origin && SITE_ORIGINS.has(origin)) {
    resHeaders.set("Access-Control-Allow-Origin", origin);
    resHeaders.set(
      "Access-Control-Allow-Methods",
      "GET, POST, DELETE, OPTIONS",
    );
    resHeaders.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    resHeaders.set("Access-Control-Allow-Credentials", "true");
    resHeaders.set("Vary", "Origin");
  }
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return "unknown";
}

export function corsPreflight(req: Request): Response {
  const headers = new Headers();
  applyMeCors(req, headers);
  return new Response(null, { status: 204, headers });
}

export async function requireUser(req: Request): Promise<
  | { ok: true; userId: string; headers: Headers }
  | { ok: false; response: Response }
> {
  const headers = new Headers();
  applyMeCors(req, headers);

  const ip = clientIp(req);
  if (!ipApiLimiter.allow(ip)) {
    headers.set("Content-Type", "application/json");
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "rate_limit" }), {
        status: 429,
        headers,
      }),
    };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    headers.set("Content-Type", "application/json");
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers,
      }),
    };
  }

  return { ok: true, userId, headers };
}

export function enforceUserSaveRate(
  userId: string,
  headers: Headers,
): Response | null {
  if (!userSaveLimiter.allow(`save:${userId}`)) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: false, error: "rate_limit" }), {
      status: 429,
      headers,
    });
  }
  return null;
}

export function json(
  data: unknown,
  status: number,
  headers: Headers,
): Response {
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status, headers });
}

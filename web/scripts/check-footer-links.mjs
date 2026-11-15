#!/usr/bin/env node
/**
 * Check footer destinations (internal + external).
 * Usage: node scripts/check-footer-links.mjs [baseUrl]
 */
const BASE = (process.argv[2] || "http://127.0.0.1:3010").replace(/\/$/, "");
const MCP_ENDPOINT = "https://mcp.applicable.click/mcp";

const INTERNAL = [
  "/",
  "/#how",
  "/#mcp",
  "/labels",
  "/labels#open",
  "/labels#india-remote",
  "/labels#india-onsite",
  "/labels#region-locked",
  "/labels#unclear",
  "/blog",
  "/dashboard/jobs",
  "/dashboard/companies",
];

const EXTERNAL = [
  "https://joinwaitlist.parthkadam.tech",
  "https://www.hydradb.ai",
  "https://www.parthkadam.tech/",
  "https://chatgpt.com/plugins",
  "https://claude.ai/customize/connectors",
  "https://cursor.com/",
  MCP_ENDPOINT,
];

const OK = new Set([200, 201, 204, 301, 302, 303, 307, 308, 401, 403, 406]);

async function check(url) {
  if (url.startsWith("mailto:")) {
    return { url, ok: true, status: "mailto", skipped: true };
  }
  try {
    const accept =
      url.includes("/mcp")
        ? "application/json, text/event-stream, */*"
        : "text/html,application/json,*/*";
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: accept,
        "User-Agent": "ApplicableFooterCheck/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const status = res.status;
    // 406 on MCP Streamable HTTP is a live endpoint rejecting plain browser GETs.
    const ok =
      OK.has(status) ||
      (status >= 200 && status < 400) ||
      (url.includes("/mcp") && status === 406);
    return { url, ok, status };
  } catch (err) {
    return { url, ok: false, status: String(err?.message || err) };
  }
}

async function main() {
  const results = [];

  for (const path of INTERNAL) {
    const [pathname, hash] = path.split("#");
    const url = `${BASE}${pathname || "/"}`;
    const r = await check(url);
    if (hash && r.ok && (pathname === "/" || pathname === "")) {
      const html = await fetch(url, {
        headers: { "User-Agent": "ApplicableFooterCheck/1.0" },
      }).then((x) => x.text());
      const idOk =
        html.includes(`id="${hash}"`) || html.includes(`id='${hash}'`);
      results.push({
        url: `${url}#${hash}`,
        ok: idOk,
        status: idOk ? r.status : `missing #${hash}`,
      });
      continue;
    }
    results.push({ ...r, url: hash ? `${url}#${hash}` : r.url });
  }

  for (const url of EXTERNAL) {
    results.push(await check(url));
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "OK" : "FAIL"}\t${r.status}\t${r.url}`);
  }
  console.log(`\n${results.length} checked, ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main();

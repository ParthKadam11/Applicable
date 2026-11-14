import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function storePath(): string {
  return (
    process.env.WAITLIST_STORE_PATH ||
    join("/home/deployer/backups", "applicable-waitlist.jsonl")
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const emailRaw =
    typeof body === "object" &&
    body &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";
  const email = emailRaw.trim().toLowerCase();

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email." },
      { status: 400 },
    );
  }

  const path = storePath();
  try {
    await mkdir(dirname(path), { recursive: true });

    // Dedup against existing file (small list expected).
    let already = false;
    try {
      const { readFile } = await import("node:fs/promises");
      const existing = await readFile(path, "utf8");
      already = existing
        .split("\n")
        .filter(Boolean)
        .some((line) => {
          try {
            return JSON.parse(line).email === email;
          } catch {
            return false;
          }
        });
    } catch {
      // file may not exist yet
    }

    if (!already) {
      const row = JSON.stringify({
        email,
        ts: new Date().toISOString(),
        ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      });
      await appendFile(path, `${row}\n`, "utf8");
    }

    return NextResponse.json({ ok: true, already });
  } catch (err) {
    console.error("[waitlist]", err);
    return NextResponse.json(
      { ok: false, error: "Could not save. Try again shortly." },
      { status: 500 },
    );
  }
}

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const SECRET = process.env.QA_SHOT_SECRET || "footer-rebuild";

export async function POST(req: Request) {
  if (req.headers.get("x-qa-secret") !== SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    data?: string;
  } | null;
  const name = (body?.name || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const data = body?.data || "";
  if (!name.endsWith(".png") || data.length < 32) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const dir = path.join(process.cwd(), "qa-screenshots");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(data, "base64"));
  return NextResponse.json({ ok: true });
}

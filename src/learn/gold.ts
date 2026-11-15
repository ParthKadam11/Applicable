import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GoldRowSchema, type GoldRow } from "./types.js";

export function goldPath(root = process.cwd()): string {
  return join(root, "eval", "gold.jsonl");
}

export function loadGold(path = goldPath()): GoldRow[] {
  if (!existsSync(path)) {
    throw new Error(`Gold set missing: ${path}. Run npm run eval:export-gold`);
  }
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const rows: GoldRow[] = [];
  for (const line of lines) {
    const parsed = GoldRowSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw new Error(`Invalid gold row: ${parsed.error.message}`);
    }
    rows.push(parsed.data);
  }
  return rows;
}

export function goldJobIdSet(rows?: GoldRow[]): Set<string> {
  const list = rows ?? loadGold();
  return new Set(list.map((r) => r.job_id));
}

export function goldLabelDistribution(rows: GoldRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.verified_label] = (out[r.verified_label] ?? 0) + 1;
  }
  return out;
}

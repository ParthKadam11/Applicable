import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GoldRowSchema, type GoldRow } from "./types.js";

export function goldPath(root = process.cwd()): string {
  return join(root, "eval", "gold.jsonl");
}

export function goldTestPath(root = process.cwd()): string {
  return join(root, "eval", "gold-test.jsonl");
}

export function loadGoldFile(path: string): GoldRow[] {
  if (!existsSync(path)) {
    throw new Error(`Gold set missing: ${path}`);
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

export function loadGold(path = goldPath()): GoldRow[] {
  return loadGoldFile(path);
}

export function loadGoldTest(path = goldTestPath()): GoldRow[] {
  return loadGoldFile(path);
}

/** All job ids that must never receive corrections (gold + gold-test). */
export function protectedGoldJobIds(root = process.cwd()): Set<string> {
  const ids = new Set<string>();
  for (const path of [goldPath(root), goldTestPath(root)]) {
    if (!existsSync(path)) continue;
    for (const row of loadGoldFile(path)) ids.add(row.job_id);
  }
  return ids;
}

export function goldJobIdSet(rows?: GoldRow[]): Set<string> {
  if (rows) return new Set(rows.map((r) => r.job_id));
  return protectedGoldJobIds();
}

export function goldLabelDistribution(rows: GoldRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.verified_label] = (out[r.verified_label] ?? 0) + 1;
  }
  return out;
}

export function goldProvenanceBreakdown(
  rows: GoldRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const p = r.provenance ?? "copied_from_prod";
    out[p] = (out[p] ?? 0) + 1;
  }
  return out;
}

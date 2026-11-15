/**
 * After hand-labeling eval/gold-test-hand.csv, update gold-test.jsonl
 * verified_label from hand_label and re-run baseline vs learned + curve.
 *
 * npm run eval:promote-hand
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { IndiaEligibilitySchema } from "../classify/types.js";
import { goldTestPath, loadGoldTest } from "../learn/gold.js";
import type { GoldRow } from "../learn/types.js";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function main() {
  const csvPath = join(process.cwd(), "eval", "gold-test-hand.csv");
  if (!existsSync(csvPath)) {
    throw new Error(
      `Missing ${csvPath}. Run npm run eval:export-hand first, fill hand_label, then retry.`,
    );
  }
  const table = parseCsv(readFileSync(csvPath, "utf8"));
  const header = table[0] ?? [];
  const idx = {
    url: header.indexOf("job_url"),
    title: header.indexOf("title"),
    company: header.indexOf("company"),
    location: header.indexOf("location_raw"),
    predicted: header.indexOf("predicted_label"),
    evidence: header.indexOf("evidence"),
    hand: header.indexOf("hand_label"),
  };
  if (idx.hand < 0 || idx.title < 0 || idx.company < 0) {
    throw new Error("CSV missing required columns");
  }

  const handByKey = new Map<string, string>();
  for (const r of table.slice(1)) {
    const hand = (r[idx.hand] ?? "").trim();
    if (!hand) continue;
    const parsed = IndiaEligibilitySchema.safeParse(hand);
    if (!parsed.success) {
      throw new Error(`Invalid hand_label "${hand}" (row title=${r[idx.title]})`);
    }
    const key = `${r[idx.company] ?? ""}\t${r[idx.title] ?? ""}\t${r[idx.location] ?? ""}`;
    handByKey.set(key, parsed.data);
  }

  if (handByKey.size === 0) {
    throw new Error("No hand_label values filled in CSV — nothing to promote");
  }

  const gold = loadGoldTest();
  let updated = 0;
  const next: GoldRow[] = gold.map((row) => {
    const key = `${row.company}\t${row.title}\t${row.location_raw ?? ""}`;
    const hand = handByKey.get(key);
    if (!hand) return row;
    if (hand === row.verified_label) return row;
    updated += 1;
    return {
      ...row,
      verified_label: hand,
      verified: true,
      provenance: "hand_verified",
    };
  });

  const path = goldTestPath();
  writeFileSync(path, next.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(
    JSON.stringify(
      { gold_test: path, hand_labels: handByKey.size, updated },
      null,
      2,
    ),
  );

  const run = (script: string) => {
    const r = spawnSync("npm", ["run", script], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    if (r.status !== 0) {
      throw new Error(`${script} failed with status ${r.status}`);
    }
  };
  run("eval:gold-test");
  run("eval:curve");
}

main();

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { goldJobIdSet, loadGold } from "../../src/learn/gold.js";
import { formatCompareTable } from "../../src/learn/metrics.js";
import type { EvalReport } from "../../src/learn/types.js";

describe("gold no-leakage helpers", () => {
  it("loads gold ids as a set", () => {
    const dir = join(tmpdir(), `applicable-gold-${Date.now()}`);
    mkdirSync(join(dir, "eval"), { recursive: true });
    const path = join(dir, "eval", "gold.jsonl");
    const id = "11111111-1111-1111-1111-111111111111";
    writeFileSync(
      path,
      JSON.stringify({
        job_id: id,
        title: "T",
        company: "C",
        location_raw: "Remote",
        description_snippet: "Open to candidates from India",
        description_text: "Open to candidates from India",
        verified_label: "open",
        evidence: "Open to candidates from India",
        verified: true,
      }) + "\n",
    );
    const rows = loadGold(path);
    expect(rows).toHaveLength(1);
    const set = goldJobIdSet(rows);
    expect(set.has(id)).toBe(true);
    expect(set.has("00000000-0000-0000-0000-000000000000")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("compare output", () => {
  it("prints a markdown table with deltas", () => {
    const mk = (kind: "baseline" | "learned", acc: number): EvalReport => ({
      kind,
      timestamp: new Date().toISOString(),
      n: 10,
      accuracy: acc,
      unclear_rate: 0.2,
      evidence_validity_rate: 0.9,
      bad_evidence_rate: 0.1,
      per_label: {
        open: { precision: 0.5, recall: 0.5, f1: 0.5, support: 2 },
        india_remote: { precision: 0, recall: 0, f1: 0, support: 1 },
        india_onsite: { precision: 0.5, recall: 0.5, f1: 0.5, support: 2 },
        region_locked: { precision: 0.8, recall: 0.8, f1: 0.8, support: 3 },
        unclear: { precision: 0.4, recall: 0.4, f1: 0.4, support: 2 },
      },
      confusion: {},
      predictions: [],
    });
    const table = formatCompareTable(mk("baseline", 0.7), mk("learned", 0.8));
    expect(table).toContain("| accuracy |");
    expect(table).toContain("+10.0pp");
    expect(table).toContain("F1 open");
  });
});

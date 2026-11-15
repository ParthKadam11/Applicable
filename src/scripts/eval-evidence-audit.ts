/** npm run eval:evidence-audit [-- --repair] */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import { pool } from "../db/client.js";
import {
  classifyEvidenceFailure,
  selectBestEligibilityEvidence,
  validateEligibilityEvidence,
} from "../learn/evidence-guard.js";
import { loadGold, loadGoldTest } from "../learn/gold.js";
import type { GoldRow } from "../learn/types.js";

function audit(rows: GoldRow[], repair: boolean) {
  const causes: Record<string, number> = {};
  const samples: Record<string, Array<{ company: string; ev: string }>> = {};
  let decisive = 0;
  let bad = 0;
  for (const row of rows) {
    const desc = row.description_text ?? row.description_snippet;
    const r = classifyIndiaEligibility({
      title: row.title,
      locationRaw: row.location_raw,
      descriptionText: desc,
    });
    if (r.india_eligibility === "unclear") continue;
    decisive += 1;
    let ev = r.eligibility_evidence[0] ?? "";
    if (repair) {
      const picked = selectBestEligibilityEvidence({
        title: row.title,
        locationRaw: row.location_raw,
        descriptionText: desc,
        candidates: r.eligibility_evidence,
      });
      ev = picked.evidence ?? "";
    }
    const cause = classifyEvidenceFailure(
      ev,
      row.title,
      row.location_raw,
      desc || ev,
    );
    const ok =
      cause === "ok" ||
      validateEligibilityEvidence({
        evidence: ev,
        title: row.title,
        locationRaw: row.location_raw,
        descriptionText: desc || ev,
      }).ok;
    if (!ok) {
      bad += 1;
      const key = cause === "ok" ? "not_about_eligibility" : cause;
      causes[key] = (causes[key] ?? 0) + 1;
      (samples[key] ??= []).push({
        company: row.company,
        ev: ev.slice(0, 120),
      });
    } else {
      causes.ok = (causes.ok ?? 0) + 1;
    }
  }
  return {
    repair,
    decisive,
    bad,
    bad_evidence_rate: decisive === 0 ? 0 : bad / decisive,
    causes,
    samples,
  };
}

async function main() {
  const rows = [...loadGold(), ...loadGoldTest()];
  const before = audit(rows, false);
  const after = audit(rows, true);
  const dir = join(process.cwd(), "eval", "results");
  mkdirSync(dir, { recursive: true });
  const out = { n_jobs: rows.length, before, after };
  writeFileSync(
    join(dir, "evidence-audit.json"),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});

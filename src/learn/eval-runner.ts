import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import type { Db } from "../db/client.js";
import { classifyV2 } from "./classifier-v2.js";
import {
  isEligibilityEvidence,
  isEvidenceSubstring,
  validateEligibilityEvidence,
} from "./evidence-guard.js";
import { loadGold } from "./gold.js";
import { buildEvalReport } from "./metrics.js";
import { loadPatterns } from "./patterns.js";
import type { EvalPrediction, EvalReport, GoldRow } from "./types.js";

export function resultsDir(root = process.cwd()): string {
  return join(root, "eval", "results");
}

function scoreEvidence(
  evidence: string[],
  row: GoldRow,
): { valid: boolean; about: boolean } {
  if (evidence.length === 0) return { valid: false, about: false };
  const desc = row.description_text ?? row.description_snippet;
  for (const e of evidence) {
    const v = validateEligibilityEvidence({
      evidence: e,
      title: row.title,
      locationRaw: row.location_raw,
      descriptionText: desc,
    });
    if (v.ok) return { valid: true, about: true };
  }
  let valid = false;
  let about = false;
  for (const e of evidence) {
    if (isEvidenceSubstring(e, row.title, row.location_raw, desc)) valid = true;
    if (isEligibilityEvidence(e)) about = true;
  }
  return { valid, about };
}

export function runBaselineOnGold(rows: GoldRow[]): EvalReport {
  const predictions: EvalPrediction[] = [];
  for (const row of rows) {
    const desc = row.description_text ?? row.description_snippet;
    const r = classifyIndiaEligibility({
      title: row.title,
      locationRaw: row.location_raw,
      descriptionText: desc,
    });
    const ev = scoreEvidence(r.eligibility_evidence, row);
    predictions.push({
      job_id: row.job_id,
      gold_label: row.verified_label,
      pred_label: r.india_eligibility,
      evidence: r.eligibility_evidence,
      evidence_valid: ev.valid,
      evidence_about_eligibility: ev.about,
      source: "rules",
    });
  }
  return buildEvalReport("baseline", predictions);
}

export async function runLearnedOnGold(
  db: Db,
  rows: GoldRow[],
  opts?: { useLlm?: boolean; patternsOnly?: boolean },
): Promise<EvalReport> {
  const patterns = await loadPatterns(db);
  const predictions: EvalPrediction[] = [];
  for (const row of rows) {
    const desc = row.description_text ?? row.description_snippet;
    const r = await classifyV2(
      {
        title: row.title,
        locationRaw: row.location_raw,
        descriptionText: desc,
        jobId: row.job_id,
      },
      {
        db,
        patterns,
        useCompanyPrior: !opts?.patternsOnly,
        useLlm: opts?.useLlm ?? false,
      },
    );
    const ev = scoreEvidence(r.eligibility_evidence, row);
    predictions.push({
      job_id: row.job_id,
      gold_label: row.verified_label,
      pred_label: r.india_eligibility,
      evidence: r.eligibility_evidence,
      evidence_valid: ev.valid,
      evidence_about_eligibility: ev.about,
      source: r.source,
    });
  }
  return buildEvalReport("learned", predictions);
}

export function saveEvalReport(
  report: EvalReport,
  root = process.cwd(),
): string {
  const dir = resultsDir(root);
  mkdirSync(dir, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, "-");
  const path = join(dir, `${report.kind}-${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  writeFileSync(
    join(dir, `${report.kind}-latest.json`),
    JSON.stringify(report, null, 2),
  );
  return path;
}

export function loadLatestReport(
  kind: "baseline" | "learned",
  root = process.cwd(),
): EvalReport | null {
  const latest = join(resultsDir(root), `${kind}-latest.json`);
  if (existsSync(latest)) {
    return JSON.parse(readFileSync(latest, "utf8")) as EvalReport;
  }
  try {
    const files = readdirSync(resultsDir(root))
      .filter((f) => f.startsWith(`${kind}-`) && f.endsWith(".json"))
      .filter((f) => !f.endsWith("-latest.json"))
      .sort();
    const last = files[files.length - 1];
    if (!last) return null;
    return JSON.parse(
      readFileSync(join(resultsDir(root), last), "utf8"),
    ) as EvalReport;
  } catch {
    return null;
  }
}

export { loadGold };

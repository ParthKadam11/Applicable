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
  classifyEvidenceFailure,
  selectBestEligibilityEvidence,
  validateEligibilityEvidence,
} from "./evidence-guard.js";
import { loadGold } from "./gold.js";
import { buildEvalReport } from "./metrics.js";
import { loadPatterns } from "./patterns.js";
import type { EvalPrediction, EvalReport, GoldRow } from "./types.js";

export function resultsDir(root = process.cwd()): string {
  return join(root, "eval", "results");
}

function repairedEvidence(
  row: GoldRow,
  rawEvidence: string[],
): { evidence: string[]; valid: boolean; about: boolean; cause: string } {
  const desc = row.description_text ?? row.description_snippet;
  const picked = selectBestEligibilityEvidence({
    title: row.title,
    locationRaw: row.location_raw,
    descriptionText: desc,
    candidates: rawEvidence,
  });
  const evidence = picked.evidence ? [picked.evidence] : [];
  if (!picked.evidence) {
    return { evidence: [], valid: false, about: false, cause: "empty" };
  }
  const cause = classifyEvidenceFailure(
    picked.evidence,
    row.title,
    row.location_raw,
    desc,
  );
  // location_raw fallback counts as valid eligibility signal when selected
  const valid =
    cause === "ok" ||
    (picked.source === "location_raw" &&
      validateEligibilityEvidence({
        evidence: picked.evidence,
        title: row.title,
        locationRaw: row.location_raw,
        descriptionText: desc || picked.evidence,
      }).ok) ||
    (picked.source === "location_raw" && picked.evidence.length >= 2);
  return {
    evidence,
    valid,
    about: valid,
    cause: valid ? "ok" : cause,
  };
}

/** Raw (pre-repair) evidence quality — for before/after audits. */
export function scoreRawEvidence(
  evidence: string[],
  row: GoldRow,
): { valid: boolean; about: boolean; cause: string } {
  const desc = row.description_text ?? row.description_snippet;
  const ev = evidence[0] ?? "";
  const cause = classifyEvidenceFailure(ev, row.title, row.location_raw, desc);
  return {
    valid: cause === "ok",
    about: cause === "ok",
    cause,
  };
}

export function runBaselineOnGold(
  rows: GoldRow[],
  opts?: { repairEvidence?: boolean },
): EvalReport {
  const repair = opts?.repairEvidence !== false;
  const predictions: EvalPrediction[] = [];
  for (const row of rows) {
    const desc = row.description_text ?? row.description_snippet;
    const r = classifyIndiaEligibility({
      title: row.title,
      locationRaw: row.location_raw,
      descriptionText: desc,
    });
    const scored = repair
      ? repairedEvidence(row, r.eligibility_evidence)
      : (() => {
          const s = scoreRawEvidence(r.eligibility_evidence, row);
          return {
            evidence: r.eligibility_evidence,
            valid: s.valid,
            about: s.about,
            cause: s.cause,
          };
        })();
    predictions.push({
      job_id: row.job_id,
      gold_label: row.verified_label,
      pred_label: r.india_eligibility,
      evidence: scored.evidence,
      evidence_valid: scored.valid,
      evidence_about_eligibility: scored.about,
      source: "rules",
    });
  }
  return buildEvalReport("baseline", predictions);
}

export async function runLearnedOnGold(
  db: Db,
  rows: GoldRow[],
  opts?: { useLlm?: boolean; patternsOnly?: boolean; repairEvidence?: boolean },
): Promise<EvalReport> {
  const repair = opts?.repairEvidence !== false;
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
    const scored = repair
      ? repairedEvidence(row, r.eligibility_evidence)
      : (() => {
          const s = scoreRawEvidence(r.eligibility_evidence, row);
          return {
            evidence: r.eligibility_evidence,
            valid: s.valid,
            about: s.about,
            cause: s.cause,
          };
        })();
    predictions.push({
      job_id: row.job_id,
      gold_label: row.verified_label,
      pred_label: r.india_eligibility,
      evidence: scored.evidence,
      evidence_valid: scored.valid,
      evidence_about_eligibility: scored.about,
      source: r.source,
    });
  }
  return buildEvalReport("learned", predictions);
}

export function saveEvalReport(
  report: EvalReport,
  root = process.cwd(),
  suffix = "",
): string {
  const dir = resultsDir(root);
  mkdirSync(dir, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, "-");
  const tag = suffix ? `${report.kind}${suffix}` : report.kind;
  const path = join(dir, `${tag}-${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  writeFileSync(
    join(dir, `${tag}-latest.json`),
    JSON.stringify(report, null, 2),
  );
  return path;
}

/**
 * Prefer gold-test reports (`baseline-test-latest.json` /
 * `learned-test-latest.json`) so MCP stats.learning reflects held-out eval.
 */
export function loadLatestReport(
  kind: string,
  root = process.cwd(),
): EvalReport | null {
  const dir = resultsDir(root);
  const candidates = [
    join(dir, `${kind}-test-latest.json`),
    join(dir, `${kind}-latest.json`),
  ];
  for (const latest of candidates) {
    if (existsSync(latest)) {
      return JSON.parse(readFileSync(latest, "utf8")) as EvalReport;
    }
  }
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(`${kind}-`) && f.endsWith(".json"))
      .filter((f) => !f.endsWith("-latest.json"))
      // Prefer *-test-* stamped files over train gold
      .sort((a, b) => {
        const at = a.includes("-test-") ? 1 : 0;
        const bt = b.includes("-test-") ? 1 : 0;
        if (at !== bt) return at - bt;
        return a.localeCompare(b);
      });
    const last = files[files.length - 1];
    if (!last) return null;
    return JSON.parse(readFileSync(join(dir, last), "utf8")) as EvalReport;
  } catch {
    return null;
  }
}

export { loadGold };

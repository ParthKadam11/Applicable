import type { EvalPrediction, EvalReport, LabelMetrics } from "./types.js";

const LABELS = [
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
] as const;

export function emptyConfusion(): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  for (const a of LABELS) {
    m[a] = {};
    for (const b of LABELS) m[a]![b] = 0;
  }
  return m;
}

export function computeLabelMetrics(
  predictions: EvalPrediction[],
): Record<string, LabelMetrics> {
  const out: Record<string, LabelMetrics> = {};
  for (const label of LABELS) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (const p of predictions) {
      if (p.gold_label === label) support += 1;
      if (p.pred_label === label && p.gold_label === label) tp += 1;
      if (p.pred_label === label && p.gold_label !== label) fp += 1;
      if (p.gold_label === label && p.pred_label !== label) fn += 1;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
    out[label] = { precision, recall, f1, support };
  }
  return out;
}

export function buildEvalReport(
  kind: "baseline" | "learned",
  predictions: EvalPrediction[],
): EvalReport {
  const n = predictions.length;
  let correct = 0;
  let unclear = 0;
  let evidenceValid = 0;
  let evidenceChecked = 0;
  let badEvidence = 0;
  const confusion = emptyConfusion();

  for (const p of predictions) {
    if (p.pred_label === p.gold_label) correct += 1;
    if (p.pred_label === "unclear") unclear += 1;
    if (p.pred_label !== "unclear") {
      evidenceChecked += 1;
      if (p.evidence_valid && p.evidence_about_eligibility) evidenceValid += 1;
      if (!p.evidence_valid || !p.evidence_about_eligibility) badEvidence += 1;
    }
    if (!confusion[p.gold_label]) confusion[p.gold_label] = {};
    if (!confusion[p.gold_label]![p.pred_label]) {
      confusion[p.gold_label]![p.pred_label] = 0;
    }
    confusion[p.gold_label]![p.pred_label]! += 1;
  }

  return {
    kind,
    timestamp: new Date().toISOString(),
    n,
    accuracy: n === 0 ? 0 : correct / n,
    unclear_rate: n === 0 ? 0 : unclear / n,
    evidence_validity_rate:
      evidenceChecked === 0 ? 1 : evidenceValid / evidenceChecked,
    bad_evidence_rate:
      evidenceChecked === 0 ? 0 : badEvidence / evidenceChecked,
    per_label: computeLabelMetrics(predictions),
    confusion,
    predictions,
  };
}

export function formatCompareTable(
  baseline: EvalReport,
  learned: EvalReport,
): string {
  const rows: string[] = [];
  const fmt = (n: number) => (n * 100).toFixed(1) + "%";
  const delta = (a: number, b: number) => {
    const d = (b - a) * 100;
    return `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`;
  };

  rows.push("| metric | baseline | learned | delta |");
  rows.push("|---|---:|---:|---:|");
  rows.push(
    `| accuracy | ${fmt(baseline.accuracy)} | ${fmt(learned.accuracy)} | ${delta(baseline.accuracy, learned.accuracy)} |`,
  );
  rows.push(
    `| unclear rate | ${fmt(baseline.unclear_rate)} | ${fmt(learned.unclear_rate)} | ${delta(baseline.unclear_rate, learned.unclear_rate)} |`,
  );
  rows.push(
    `| bad-evidence rate | ${fmt(baseline.bad_evidence_rate)} | ${fmt(learned.bad_evidence_rate)} | ${delta(baseline.bad_evidence_rate, learned.bad_evidence_rate)} |`,
  );
  rows.push(
    `| evidence validity | ${fmt(baseline.evidence_validity_rate)} | ${fmt(learned.evidence_validity_rate)} | ${delta(baseline.evidence_validity_rate, learned.evidence_validity_rate)} |`,
  );

  for (const label of LABELS) {
    const b = baseline.per_label[label]?.f1 ?? 0;
    const l = learned.per_label[label]?.f1 ?? 0;
    rows.push(
      `| F1 ${label} | ${fmt(b)} | ${fmt(l)} | ${delta(b, l)} |`,
    );
  }
  return rows.join("\n");
}

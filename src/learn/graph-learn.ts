import { createGraphClient } from "../graph/driver.js";
import { stableGraphId } from "../graph/ids.js";
import {
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_LABELS,
} from "../graph/cypher.js";

const HYDRA_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function learningNodeLabels() {
  return [...GRAPH_NODE_LABELS, "Correction", "Pattern"] as const;
}

export function learningEdgeTypes() {
  return [
    ...GRAPH_EDGE_TYPES,
    "CORRECTED_BY",
    "ABOUT_COMPANY",
    "USES_PATTERN",
  ] as const;
}

export type PushCorrectionArgs = {
  correctionId: string;
  jobId: string;
  companyId: string;
  companyName: string;
  oldLabel: string | null;
  newLabel: string;
  evidence: string;
  source: string;
  patternPhrase: string | null;
  patternLabel: string | null;
  patternWeight: number | null;
};

export type GraphPushResult = {
  ok: boolean;
  error?: string;
  steps: Array<{ step: string; ok: boolean; error?: string }>;
};

/**
 * Write Correction (+ optional Pattern) nodes and link to Job / Company.
 * Logs every dialect failure; returns structured step results (not silent).
 */
export async function pushCorrectionToGraph(
  args: PushCorrectionArgs,
): Promise<GraphPushResult> {
  const client = createGraphClient();
  const steps: GraphPushResult["steps"] = [];
  if (!client.enabled) {
    const error = "graph_disabled";
    console.warn(`[learn:graph] ${error}`);
    return { ok: false, error, steps: [{ step: "enable", ok: false, error }] };
  }

  const runStep = async (step: string, fn: () => Promise<unknown>) => {
    try {
      await withTimeout(fn(), HYDRA_TIMEOUT_MS, `hydra:${step}`);
      steps.push({ step, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[learn:graph] step=${step} FAILED: ${error}`);
      steps.push({ step, ok: false, error });
      throw err;
    }
  };

  try {
    const correctionNodeId = stableGraphId("correction", args.correctionId);
    const jobNodeId = stableGraphId("job", args.jobId);
    const companyNodeId = stableGraphId("company", args.companyId);

    await runStep("correction_upsert", () =>
      client.run(
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Correction, n.ext_id = row.ext_id, n.old_label = row.old_label, n.new_label = row.new_label, n.evidence = row.evidence, n.source = row.source`,
        {
          rows: [
            {
              id: correctionNodeId,
              ext_id: args.correctionId,
              old_label: args.oldLabel ?? "",
              new_label: args.newLabel,
              evidence: args.evidence.slice(0, 2000),
              source: args.source,
            },
          ],
        },
      ),
    );

    await runStep("job_stub", () =>
      client.run(
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Job, n.ext_id = row.ext_id`,
        { rows: [{ id: jobNodeId, ext_id: args.jobId }] },
      ),
    );
    await runStep("company_stub", () =>
      client.run(
        `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Company, n.ext_id = row.ext_id, n.name = row.name`,
        {
          rows: [
            {
              id: companyNodeId,
              ext_id: args.companyId,
              name: args.companyName.slice(0, 200),
            },
          ],
        },
      ),
    );

    // HydraDB rejects plain MATCH…CREATE for some label pairs; use UNWIND batch
    // shapes documented in cypher-compat (MATCH endpoints + CREATE, or bare ids).
    await runStep("edge_corrected_by", () =>
      client.run(
        `UNWIND $rows AS row MATCH (a:Job {id: row.src}), (b:Correction {id: row.dst}) CREATE (a)-[:CORRECTED_BY]->(b)`,
        { rows: [{ src: jobNodeId, dst: correctionNodeId }] },
      ),
    );
    await runStep("edge_about_company", () =>
      client.run(
        `UNWIND $rows AS row MATCH (a:Correction {id: row.src}), (b:Company {id: row.dst}) CREATE (a)-[:ABOUT_COMPANY]->(b)`,
        { rows: [{ src: correctionNodeId, dst: companyNodeId }] },
      ),
    );

    if (args.patternPhrase) {
      const patternId = stableGraphId("pattern", args.patternPhrase);
      await runStep("pattern_upsert", () =>
        client.run(
          `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Pattern, n.phrase = row.phrase, n.label = row.label, n.weight = row.weight`,
          {
            rows: [
              {
                id: patternId,
                phrase: args.patternPhrase!.slice(0, 200),
                label: args.patternLabel ?? args.newLabel,
                weight: args.patternWeight ?? 1,
              },
            ],
          },
        ),
      );
      await runStep("edge_uses_pattern", () =>
        client.run(
          `UNWIND $rows AS row MATCH (a:Correction {id: row.src}), (b:Pattern {id: row.dst}) CREATE (a)-[:USES_PATTERN]->(b)`,
          { rows: [{ src: correctionNodeId, dst: patternId }] },
        ),
      );
    }

    return { ok: true, steps };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[learn:graph] pushCorrectionToGraph failed: ${error}`);
    return { ok: false, error, steps };
  }
}

export async function countLearningGraphNodes(): Promise<{
  enabled: boolean;
  correction_nodes: number;
  pattern_nodes: number;
  corrected_by_edges: number;
  uses_pattern_edges: number;
  errors: string[];
}> {
  const client = createGraphClient();
  const errors: string[] = [];
  if (!client.enabled) {
    return {
      enabled: false,
      correction_nodes: 0,
      pattern_nodes: 0,
      corrected_by_edges: 0,
      uses_pattern_edges: 0,
      errors: ["graph_disabled"],
    };
  }
  const count = async (cypher: string, label: string) => {
    try {
      const r = await withTimeout(
        client.run(cypher),
        HYDRA_TIMEOUT_MS,
        label,
      );
      return Number(r.records[0]?.n ?? 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg}`);
      console.error(`[learn:graph] count failed ${label}: ${msg}`);
      return -1;
    }
  };
  return {
    enabled: true,
    correction_nodes: await count(
      `MATCH (n:Correction) RETURN count(*) AS n`,
      "count_correction",
    ),
    pattern_nodes: await count(
      `MATCH (n:Pattern) RETURN count(*) AS n`,
      "count_pattern",
    ),
    corrected_by_edges: await count(
      `MATCH ()-[r:CORRECTED_BY]->() RETURN count(*) AS n`,
      "count_corrected_by",
    ),
    uses_pattern_edges: await count(
      `MATCH ()-[r:USES_PATTERN]->() RETURN count(*) AS n`,
      "count_uses_pattern",
    ),
    errors,
  };
}

export async function fetchSimilarCorrectionsFromGraph(
  phraseHints: string[],
  k = 3,
): Promise<Array<{ evidence: string; new_label: string; phrase: string }>> {
  const client = createGraphClient();
  if (!client.enabled || phraseHints.length === 0) return [];

  const results: Array<{
    evidence: string;
    new_label: string;
    phrase: string;
  }> = [];

  try {
    for (const phrase of phraseHints.slice(0, 3)) {
      const pid = stableGraphId("pattern", phrase);
      const r = await withTimeout(
        client.run(
          `MATCH (p:Pattern {id: $pid})<-[:USES_PATTERN]-(c:Correction) RETURN c.evidence AS evidence, c.new_label AS new_label, p.phrase AS phrase`,
          { pid },
        ),
        HYDRA_TIMEOUT_MS,
        "hydra:similar",
      );
      for (const rec of r.records) {
        results.push({
          evidence: String(rec.evidence ?? ""),
          new_label: String(rec.new_label ?? ""),
          phrase: String(rec.phrase ?? phrase),
        });
        if (results.length >= k) return results;
      }
    }
  } catch (err) {
    console.error(
      "[learn:graph] fetchSimilarCorrectionsFromGraph:",
      err instanceof Error ? err.message : err,
    );
    return results;
  }
  return results;
}

/**
 * Lookup a Pattern by phrase id — used for e2e graph traces.
 */
export async function lookupPatternInGraph(phrase: string): Promise<{
  found: boolean;
  label?: string;
  weight?: number;
  error?: string;
}> {
  const client = createGraphClient();
  if (!client.enabled) return { found: false, error: "graph_disabled" };
  const pid = stableGraphId("pattern", phrase);
  try {
    const r = await withTimeout(
      client.run(
        `MATCH (p:Pattern {id: $pid}) RETURN p.phrase AS phrase, p.label AS label, p.weight AS weight`,
        { pid },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:lookup-pattern",
    );
    const rec = r.records[0];
    if (!rec) return { found: false };
    return {
      found: true,
      label: String(rec.label ?? ""),
      weight: Number(rec.weight ?? 0),
    };
  } catch (err) {
    return {
      found: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function companyLabelPriorFromGraph(
  companyId: string,
): Promise<{ label: string; n: number } | null> {
  const client = createGraphClient();
  if (!client.enabled) return null;
  const companyNodeId = stableGraphId("company", companyId);
  try {
    const r = await withTimeout(
      client.run(
        `MATCH (c:Company {id: $cid})-[:POSTS]->(j:Job) RETURN j.label AS label, count(*) AS n`,
        { cid: companyNodeId },
      ),
      HYDRA_TIMEOUT_MS,
      "hydra:company-prior",
    );
    const ranked = r.records
      .map((rec) => ({
        label: String(rec.label ?? ""),
        n: Number(rec.n ?? 0),
      }))
      .filter((x) => x.label && x.label !== "unclear")
      .sort((a, b) => b.n - a.n);
    if (ranked[0] && ranked[0].n >= 2) return ranked[0];
    return null;
  } catch (err) {
    console.error(
      "[learn:graph] companyLabelPriorFromGraph:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Fixed parameterized Cypher templates for HydraDB's OpenCypher subset.
 * Never interpolate user strings into the query text — only `$params`.
 *
 * Dialect notes (USING-HYDRADB.md / cypher-compat.md):
 * - Node `id` is integer upsert key; MERGE by id.
 * - Edgeless CREATE/MERGE rejected → UNWIND MERGE SET for nodes.
 * - Prefer MERGE / UNWIND CREATE for idempotent edges (plain CREATE duplicates).
 * - `IN` / `CONTAINS` / `IS NULL` not supported in WHERE.
 * - MERGE cannot be followed by SET in one statement (except UNWIND node batch).
 */

export type CypherQuery = {
  cypher: string;
  params: Record<string, unknown>;
};

/** Upsert labelled nodes with properties (edgeless). */
export function upsertNodesByLabel(
  label: "Company" | "Job" | "Skill" | "Label" | "Evidence" | "User",
  rows: Array<Record<string, unknown>>,
): CypherQuery {
  // Exactly one SET label required by HydraDB UNWIND vertex upsert.
  const propSets: string[] = [];
  const sample = rows[0] ?? {};
  for (const key of Object.keys(sample)) {
    if (key === "id") continue;
    propSets.push(`n.${key} = row.${key}`);
  }
  const setClause =
    propSets.length > 0
      ? `SET n:${label}, ${propSets.join(", ")}`
      : `SET n:${label}`;
  return {
    cypher: `UNWIND $rows AS row MERGE (n {id: row.id}) ${setClause}`,
    params: { rows },
  };
}

/** Idempotent edge: Company -[:POSTS]-> Job (and similar typed edges without props). */
export function mergeTypedEdges(
  relType: "POSTS" | "LABELED" | "REQUIRES" | "PROVEN_BY" | "SAVED",
  rows: Array<{ src: number; dst: number }>,
): CypherQuery {
  return {
    cypher: `UNWIND $rows AS row CREATE (a {id: row.src})-[:${relType}]->(b {id: row.dst})`,
    params: { rows },
  };
}

/** User -[:SAVED]-> Job (labeled endpoints for HydraDB UNWIND safety). */
export function mergeSavedEdges(
  rows: Array<{ src: number; dst: number }>,
): CypherQuery {
  return {
    cypher: `
UNWIND $rows AS row
MATCH (a:User {id: row.src}), (b:Job {id: row.dst})
CREATE (a)-[:SAVED]->(b)
`.trim(),
    params: { rows },
  };
}

/**
 * USES_SKILL / SIMILAR_TO with properties — MERGE by relationship id then SET.
 * HydraDB requires exactly one label on each UNWIND MATCH endpoint.
 */
export function mergeWeightedEdges(
  relType: "USES_SKILL" | "SIMILAR_TO",
  rows: Array<{
    src: number;
    dst: number;
    edgeId: number;
    weight?: number;
    score?: number;
  }>,
): CypherQuery {
  const prop =
    relType === "USES_SKILL"
      ? "SET r.weight = row.weight"
      : "SET r.score = row.score";
  const matchEnds =
    relType === "USES_SKILL"
      ? "MATCH (a:Company {id: row.src}), (b:Skill {id: row.dst})"
      : "MATCH (a:Company {id: row.src}), (b:Company {id: row.dst})";
  return {
    cypher: `
UNWIND $rows AS row
${matchEnds}
MERGE (a)-[r:${relType} {id: row.edgeId}]->(b)
${prop}
`.trim(),
    params: { rows },
  };
}

/**
 * Delete one typed outbound relationship class from a single node.
 * HydraDB rejects `UNWIND … MATCH (n {id: row.id})-[r]->() DELETE r`
 * ("UNWIND batch node requires an id property"). Per-id MATCH works.
 */
export function deleteOutgoingEdgesFromNode(
  relType:
    | "LABELED"
    | "REQUIRES"
    | "PROVEN_BY"
    | "USES_SKILL"
    | "SIMILAR_TO"
    | "SAVED",
  nodeId: number,
): CypherQuery {
  return {
    cypher: `MATCH (n {id: $id})-[r:${relType}]->() DELETE r`,
    params: { id: nodeId },
  };
}

/** Delete a typed edge between two known endpoints (UNWIND-safe). */
export function deleteTypedEdgesBetween(
  relType:
    | "LABELED"
    | "REQUIRES"
    | "PROVEN_BY"
    | "USES_SKILL"
    | "SIMILAR_TO"
    | "SAVED",
  rows: Array<{ src: number; dst: number }>,
): CypherQuery {
  return {
    cypher: `
UNWIND $rows AS row
MATCH (a {id: row.src})-[r:${relType}]->(b {id: row.dst})
DELETE r
`.trim(),
    params: { rows },
  };
}

export function setJobActive(rows: Array<{ id: number; active: boolean }>): CypherQuery {
  return {
    cypher: `
UNWIND $rows AS row
MATCH (n {id: row.id})
SET n.active = row.active
`.trim(),
    params: { rows },
  };
}

/**
 * Build `($p0 OR $p1 …)` predicates. HydraDB read engine rejects UNWIND+WHERE
 * ("MATCH/WITH then RETURN only") and has no `IN` — use OR + `$params`.
 */
function orEq(
  bindingProp: string,
  values: string[],
  prefix: string,
): { clause: string; params: Record<string, string> } {
  if (values.length === 0) {
    return { clause: "false", params: {} };
  }
  const params: Record<string, string> = {};
  const parts = values.map((v, i) => {
    const key = `${prefix}${i}`;
    params[key] = v;
    return `${bindingProp} = $${key}`;
  });
  return {
    clause: parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`,
    params,
  };
}

/**
 * match_skills — raw rows (no DISTINCT / no read-side UNWIND).
 * App dedupes job ids and ranks by matched skill count.
 */
export function matchSkillsQueryV2(input: {
  skills: string[];
  labels: string[];
}): CypherQuery {
  const skills = orEq("s.name", input.skills, "s");
  const labels = orEq("l.name", input.labels, "l");
  return {
    cypher: `
MATCH (j:Job)-[:REQUIRES]->(s:Skill)
WHERE j.active = true AND ${skills.clause}
MATCH (j)-[:LABELED]->(l:Label)
WHERE ${labels.clause}
OPTIONAL MATCH (j)-[:PROVEN_BY]->(e:Evidence)
RETURN j.ext_id AS jobId, s.name AS skillName, e.quote AS evidenceQuote
`.trim(),
    params: { ...skills.params, ...labels.params },
  };
}

/**
 * similar_companies — read precomputed SIMILAR_TO edges (+ shared USES_SKILL).
 * Do NOT join open jobs in the same statement: skills × jobs cartesian was ~3s.
 * Job counts use similarCompaniesOpenJobsQuery separately.
 */
export function similarCompaniesQuery(input: {
  companySlug: string;
}): CypherQuery {
  return {
    cypher: `
MATCH (c:Company)
WHERE c.slug = $slug
MATCH (c)-[sim:SIMILAR_TO]->(other:Company)
OPTIONAL MATCH (c)-[:USES_SKILL]->(s:Skill)<-[:USES_SKILL]-(other)
RETURN other.ext_id AS companyId, other.slug AS slug, other.name AS name,
       sim.score AS score, s.name AS sharedSkill
`.trim(),
    params: { slug: input.companySlug },
  };
}

/** Open / india_remote job ids for companies similar to $slug (label property). */
export function similarCompaniesOpenJobsQuery(input: {
  companySlug: string;
}): CypherQuery {
  return {
    cypher: `
MATCH (c:Company)
WHERE c.slug = $slug
MATCH (c)-[:SIMILAR_TO]->(other:Company)
OPTIONAL MATCH (other)-[:POSTS]->(j:Job)
WHERE j.active = true AND (j.label = 'open' OR j.label = 'india_remote')
RETURN other.ext_id AS companyId, j.ext_id AS jobId
`.trim(),
    params: { slug: input.companySlug },
  };
}

/** company_jobs_by_skill — raw rows; app dedupes jobs + evidence. */
export function companyJobsBySkillQuery(input: {
  skill: string;
  labels: string[];
}): CypherQuery {
  const labels = orEq("l.name", input.labels, "l");
  return {
    cypher: `
MATCH (c:Company)-[:POSTS]->(j:Job)-[:REQUIRES]->(s:Skill)
WHERE s.name = $skill AND j.active = true
MATCH (j)-[:LABELED]->(l:Label)
WHERE ${labels.clause}
OPTIONAL MATCH (j)-[:PROVEN_BY]->(e:Evidence)
RETURN c.ext_id AS companyId, c.slug AS slug, c.name AS companyName,
       j.ext_id AS jobId, j.title AS title, e.quote AS evidenceQuote
`.trim(),
    params: {
      skill: input.skill,
      ...labels.params,
    },
  };
}

/** Labels we upsert — unlabeled MATCH (n) / count(n) are unsupported. */
export const GRAPH_NODE_LABELS = [
  "Company",
  "Job",
  "Skill",
  "Label",
  "Evidence",
  "User",
] as const;

export const GRAPH_EDGE_TYPES = [
  "POSTS",
  "REQUIRES",
  "LABELED",
  "PROVEN_BY",
  "USES_SKILL",
  "SIMILAR_TO",
  "SAVED",
] as const;

export function countNodesByLabelQuery(
  label: (typeof GRAPH_NODE_LABELS)[number],
): CypherQuery {
  return { cypher: `MATCH (n:${label}) RETURN count(*) AS n`, params: {} };
}

export function countEdgesByTypeQuery(
  relType: (typeof GRAPH_EDGE_TYPES)[number],
): CypherQuery {
  return {
    cypher: `MATCH ()-[r:${relType}]->() RETURN count(*) AS n`,
    params: {},
  };
}

/** Sum labeled node counts + typed edge counts (unlabeled MATCH/count unsupported). */
export async function countGraphTotals(
  run: (
    cypher: string,
    params?: Record<string, unknown>,
  ) => Promise<{ records: Array<Record<string, unknown>> }>,
): Promise<{ nodes: number; edges: number }> {
  // Parallel label/rel counts (same totals; was ~N sequential Hydra round-trips).
  const nodeParts = await Promise.all(
    GRAPH_NODE_LABELS.map(async (label) => {
      const q = countNodesByLabelQuery(label);
      const r = await run(q.cypher, q.params);
      return Number(r.records[0]?.n ?? 0);
    }),
  );
  const edgeParts = await Promise.all(
    GRAPH_EDGE_TYPES.map(async (rel) => {
      const q = countEdgesByTypeQuery(rel);
      const r = await run(q.cypher, q.params);
      return Number(r.records[0]?.n ?? 0);
    }),
  );
  return {
    nodes: nodeParts.reduce((a, b) => a + b, 0),
    edges: edgeParts.reduce((a, b) => a + b, 0),
  };
}

/** Assert builders never embed raw user strings in cypher text. */
export function assertParameterized(q: CypherQuery, forbidden: string[]): void {
  for (const f of forbidden) {
    if (f && q.cypher.includes(f)) {
      throw new Error(`cypher must not contain user string: ${f}`);
    }
  }
}

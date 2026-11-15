/**
 * Allowlisted explore hops → fixed Cypher fragments.
 * Direction is inferred from the current node kind (no user Cypher).
 */

export const EXPLORE_HOPS = [
  "SIMILAR_TO",
  "POSTS",
  "REQUIRES",
  "USES_SKILL",
  "LABELED",
  "SAVED",
  "INVESTED_IN",
  "FOUNDED",
  "HQ_IN",
  "IN_BATCH",
] as const;

export type ExploreHop = (typeof EXPLORE_HOPS)[number];

export type NodeKind =
  | "User"
  | "Company"
  | "Job"
  | "Skill"
  | "Label"
  | "Investor"
  | "Person"
  | "Location"
  | "Batch";

export type StartType =
  | "skill"
  | "company"
  | "job"
  | "me"
  | "investor"
  | "person"
  | "batch";

export const VALID_HOP_TRANSITIONS: Record<
  NodeKind,
  Partial<Record<ExploreHop, NodeKind>>
> = {
  User: { SAVED: "Job" },
  Company: {
    SIMILAR_TO: "Company",
    POSTS: "Job",
    USES_SKILL: "Skill",
    HQ_IN: "Location",
    IN_BATCH: "Batch",
    INVESTED_IN: "Investor", // reverse: Company <-INVESTED_IN- Investor
    FOUNDED: "Person", // reverse
  },
  Job: {
    POSTS: "Company", // reverse: Job <-POSTS- Company
    REQUIRES: "Skill",
    LABELED: "Label",
    SAVED: "User", // reverse
  },
  Skill: {
    REQUIRES: "Job", // reverse: Skill <-REQUIRES- Job
    USES_SKILL: "Company", // reverse
  },
  Label: {},
  Investor: { INVESTED_IN: "Company" },
  Person: { FOUNDED: "Company" },
  Location: {},
  Batch: { IN_BATCH: "Company" }, // reverse
};

export function isExploreHop(raw: string): raw is ExploreHop {
  return (EXPLORE_HOPS as readonly string[]).includes(raw);
}

export function startKind(type: StartType): NodeKind {
  switch (type) {
    case "me":
      return "User";
    case "company":
      return "Company";
    case "job":
      return "Job";
    case "skill":
      return "Skill";
    case "investor":
      return "Investor";
    case "person":
      return "Person";
    case "batch":
      return "Batch";
  }
}

export type ValidatedPath = {
  hops: ExploreHop[];
  kinds: NodeKind[]; // kinds[0]=start, kinds[i+1] after hops[i]
};

/** Validate hop allowlist, max 3, and legal transitions. */
export function validateExplorePath(
  startType: StartType,
  path: string[],
): ValidatedPath {
  if (path.length > 3) {
    throw new Error(
      `path too long (${path.length}); max 3 hops. Allowed: ${EXPLORE_HOPS.join(", ")}`,
    );
  }
  const hops: ExploreHop[] = [];
  for (const raw of path) {
    if (!isExploreHop(raw)) {
      throw new Error(
        `unknown hop "${raw}". Allowed: ${EXPLORE_HOPS.join(", ")}`,
      );
    }
    hops.push(raw);
  }
  const kinds: NodeKind[] = [startKind(startType)];
  for (let i = 0; i < hops.length; i += 1) {
    const from = kinds[i]!;
    const hop = hops[i]!;
    const next = VALID_HOP_TRANSITIONS[from][hop];
    if (!next) {
      throw new Error(
        `invalid hop ${hop} after ${from}. Valid from ${from}: ${
          Object.keys(VALID_HOP_TRANSITIONS[from]).join(", ") || "(none)"
        }. Allowed hops: ${EXPLORE_HOPS.join(", ")}`,
      );
    }
    kinds.push(next);
  }
  if (hops.includes("SAVED") && startType !== "me") {
    throw new Error(`SAVED hop requires start.type = "me" (personal token)`);
  }
  return { hops, kinds };
}

export type BuiltExploreQuery = {
  cypher: string;
  params: Record<string, unknown>;
  /** Binding names for path formatting: n0, r0, n1, ... */
  nodeAliases: string[];
  relAliases: Array<string | null>;
  jobAlias: string | null;
  kinds: NodeKind[];
  hops: ExploreHop[];
};

function orLabelClause(
  binding: string,
  labels: string[],
): { clause: string; params: Record<string, string> } {
  if (labels.length === 0) return { clause: "true", params: {} };
  const params: Record<string, string> = {};
  const parts = labels.map((v, i) => {
    const k = `fl${i}`;
    params[k] = v;
    return `${binding}.name = $${k}`;
  });
  return {
    clause: parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`,
    params,
  };
}

/**
 * Compose MATCH chain from validated hops. All user values are $params only.
 */
export function buildExploreCypher(input: {
  startType: StartType;
  startValue?: string;
  userGraphId?: number;
  path: ValidatedPath;
  labels: string[];
}): BuiltExploreQuery {
  const { hops, kinds } = input.path;
  const params: Record<string, unknown> = {};
  const lines: string[] = [];
  const nodeAliases: string[] = [];
  const relAliases: Array<string | null> = [];

  const n0 = "n0";
  nodeAliases.push(n0);

  switch (input.startType) {
    case "me": {
      if (input.userGraphId == null) {
        throw new Error('start.type "me" requires a personal MCP token');
      }
      params.userGraphId = input.userGraphId;
      lines.push(`MATCH (${n0}:User {id: $userGraphId})`);
      break;
    }
    case "company": {
      if (!input.startValue) throw new Error("start.value required for company");
      params.start = input.startValue;
      lines.push(`MATCH (${n0}:Company) WHERE ${n0}.slug = $start`);
      break;
    }
    case "job": {
      if (!input.startValue) throw new Error("start.value required for job");
      params.start = input.startValue;
      lines.push(`MATCH (${n0}:Job) WHERE ${n0}.ext_id = $start`);
      break;
    }
    case "skill": {
      if (!input.startValue) throw new Error("start.value required for skill");
      params.start = input.startValue;
      lines.push(`MATCH (${n0}:Skill) WHERE ${n0}.name = $start`);
      break;
    }
    case "investor": {
      if (!input.startValue) throw new Error("start.value required for investor");
      params.start = input.startValue;
      lines.push(`MATCH (${n0}:Investor) WHERE ${n0}.name = $start`);
      break;
    }
    case "person": {
      if (!input.startValue) throw new Error("start.value required for person");
      params.start = input.startValue;
      lines.push(`MATCH (${n0}:Person) WHERE ${n0}.name = $start`);
      break;
    }
    case "batch": {
      if (!input.startValue) throw new Error("start.value required for batch");
      params.start = input.startValue;
      lines.push(`MATCH (${n0}:Batch) WHERE ${n0}.name = $start`);
      break;
    }
  }

  for (let i = 0; i < hops.length; i += 1) {
    const hop = hops[i]!;
    const fromKind = kinds[i]!;
    const toKind = kinds[i + 1]!;
    const src = `n${i}`;
    const dst = `n${i + 1}`;
    const rel = `r${i}`;
    nodeAliases.push(dst);

    if (hop === "SIMILAR_TO" && fromKind === "Company") {
      relAliases.push(rel);
      lines.push(`MATCH (${src})-[${rel}:SIMILAR_TO]->(${dst}:Company)`);
    } else if (hop === "POSTS" && fromKind === "Company") {
      relAliases.push(null);
      lines.push(
        `MATCH (${src})-[:POSTS]->(${dst}:Job) WHERE ${dst}.active = true`,
      );
    } else if (hop === "POSTS" && fromKind === "Job") {
      relAliases.push(null);
      lines.push(`MATCH (${dst}:Company)-[:POSTS]->(${src})`);
    } else if (hop === "REQUIRES" && fromKind === "Job") {
      relAliases.push(null);
      lines.push(`MATCH (${src})-[:REQUIRES]->(${dst}:Skill)`);
    } else if (hop === "REQUIRES" && fromKind === "Skill") {
      relAliases.push(null);
      lines.push(
        `MATCH (${dst}:Job)-[:REQUIRES]->(${src}) WHERE ${dst}.active = true`,
      );
    } else if (hop === "USES_SKILL" && fromKind === "Company") {
      relAliases.push(rel);
      lines.push(`MATCH (${src})-[${rel}:USES_SKILL]->(${dst}:Skill)`);
    } else if (hop === "USES_SKILL" && fromKind === "Skill") {
      relAliases.push(rel);
      lines.push(`MATCH (${dst}:Company)-[${rel}:USES_SKILL]->(${src})`);
    } else if (hop === "LABELED" && fromKind === "Job") {
      relAliases.push(null);
      const lab = orLabelClause(dst, input.labels);
      Object.assign(params, lab.params);
      lines.push(
        `MATCH (${src})-[:LABELED]->(${dst}:Label) WHERE ${lab.clause}`,
      );
    } else if (hop === "SAVED" && fromKind === "User") {
      relAliases.push(null);
      lines.push(
        `MATCH (${src})-[:SAVED]->(${dst}:Job) WHERE ${dst}.active = true`,
      );
    } else if (hop === "SAVED" && fromKind === "Job") {
      relAliases.push(null);
      lines.push(`MATCH (${dst}:User)-[:SAVED]->(${src})`);
    } else if (hop === "INVESTED_IN" && fromKind === "Investor") {
      relAliases.push(null);
      lines.push(`MATCH (${src})-[:INVESTED_IN]->(${dst}:Company)`);
    } else if (hop === "INVESTED_IN" && fromKind === "Company") {
      relAliases.push(null);
      lines.push(`MATCH (${dst}:Investor)-[:INVESTED_IN]->(${src})`);
    } else if (hop === "FOUNDED" && fromKind === "Person") {
      relAliases.push(null);
      lines.push(`MATCH (${src})-[:FOUNDED]->(${dst}:Company)`);
    } else if (hop === "FOUNDED" && fromKind === "Company") {
      relAliases.push(null);
      lines.push(`MATCH (${dst}:Person)-[:FOUNDED]->(${src})`);
    } else if (hop === "HQ_IN" && fromKind === "Company") {
      relAliases.push(null);
      lines.push(`MATCH (${src})-[:HQ_IN]->(${dst}:Location)`);
    } else if (hop === "IN_BATCH" && fromKind === "Company") {
      relAliases.push(null);
      lines.push(`MATCH (${src})-[:IN_BATCH]->(${dst}:Batch)`);
    } else if (hop === "IN_BATCH" && fromKind === "Batch") {
      relAliases.push(null);
      lines.push(`MATCH (${dst}:Company)-[:IN_BATCH]->(${src})`);
    } else {
      throw new Error(`cannot emit hop ${hop} from ${fromKind} to ${toKind}`);
    }
  }

  // If path ends on Job without LABELED, still filter by label property when labels set
  let jobAlias: string | null = null;
  for (let i = kinds.length - 1; i >= 0; i -= 1) {
    if (kinds[i] === "Job") {
      jobAlias = `n${i}`;
      break;
    }
  }
  // Fold label filter into the Job MATCH WHERE.
  // Hydra rejects bare WHERE after MATCH, and WITH*WHERE is unsupported.
  if (jobAlias && !hops.includes("LABELED") && input.labels.length > 0) {
    const parts = input.labels.map((v, i) => {
      const k = `jl${i}`;
      params[k] = v;
      return `${jobAlias}.label = $${k}`;
    });
    const clause = parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`;
    const idx = lines.findIndex((l) => l.includes(`(${jobAlias}:Job)`));
    if (idx >= 0) {
      const line = lines[idx]!;
      lines[idx] = line.includes(" WHERE ")
        ? `${line} AND ${clause}`
        : `${line} WHERE ${jobAlias}.active = true AND ${clause}`;
    }
  }

  // Proof quotes come from Postgres job_tags.eligibility_evidence after rehydrate —
  // do not OPTIONAL MATCH PROVEN_BY (any Evidence node) here.

  const returnParts: string[] = [];
  for (let i = 0; i < nodeAliases.length; i += 1) {
    const a = nodeAliases[i]!;
    const k = kinds[i]!;
    if (k === "Company") {
      returnParts.push(
        `${a}.name AS ${a}_name`,
        `${a}.slug AS ${a}_slug`,
        `${a}.ext_id AS ${a}_ext`,
      );
    } else if (k === "Job") {
      returnParts.push(
        `${a}.ext_id AS ${a}_ext`,
        `${a}.title AS ${a}_title`,
        `${a}.label AS ${a}_label`,
      );
    } else if (k === "Skill") {
      returnParts.push(`${a}.name AS ${a}_name`);
    } else if (k === "Label") {
      returnParts.push(`${a}.name AS ${a}_name`);
    } else if (k === "User") {
      returnParts.push(`${a}.id AS ${a}_id`);
    } else if (k === "Investor" || k === "Person" || k === "Batch") {
      returnParts.push(`${a}.name AS ${a}_name`);
    } else if (k === "Location") {
      returnParts.push(
        `${a}.city AS ${a}_city`,
        `${a}.country AS ${a}_country`,
      );
    }
  }
  for (let i = 0; i < relAliases.length; i += 1) {
    const r = relAliases[i];
    if (r && hops[i] === "SIMILAR_TO") {
      returnParts.push(`${r}.score AS ${r}_score`);
    }
    if (r && hops[i] === "USES_SKILL") {
      returnParts.push(`${r}.weight AS ${r}_weight`);
    }
  }

  lines.push(`RETURN ${returnParts.join(", ")}`);

  return {
    cypher: lines.join("\n"),
    params,
    nodeAliases,
    relAliases,
    jobAlias,
    kinds,
    hops,
  };
}

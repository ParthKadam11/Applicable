import type { HydraGraphPayload, SyncJobRow } from "./types.js";

const TEXT_CAP = 4000;

export function hydraContentHash(contentHash: string, label: string): string {
  return `${contentHash}:${label}`;
}

export function buildJobText(job: SyncJobRow): string {
  const evidence = (job.eligibilityEvidence ?? [])
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => `"${q}"`)
    .join("\n");
  const parts = [
    job.title,
    job.companyName,
    job.locationRaw ?? "",
    evidence,
    job.descriptionText.replace(/\s+/g, " ").trim(),
  ].filter(Boolean);
  const text = parts.join("\n\n");
  return text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP - 1)}…` : text;
}

export function buildJobTitle(job: SyncJobRow): string {
  return `${job.title} @ ${job.companyName}`;
}

/**
 * Bring-Your-Own-Graph from our verified Postgres fields (not LLM extraction).
 * Predicates: posts, labeled, has_role, uses_ats, evidence.
 */
export function buildJobGraph(job: SyncJobRow): HydraGraphPayload {
  const label = job.label ?? "unclear";
  const role = job.roleFamily ?? "unknown";
  const companyKey = "company";
  const jobKey = "job";
  const labelKey = "label";
  const roleKey = "role";
  const atsKey = "ats";

  const entities: HydraGraphPayload["entities"] = {
    [companyKey]: {
      name: job.companyName.slice(0, 256),
      type: "COMPANY",
      namespace: "companies",
      identifier: job.companySlug ?? undefined,
    },
    [jobKey]: {
      name: job.title.slice(0, 256),
      type: "JOB",
      namespace: "jobs",
      identifier: job.id,
    },
    [labelKey]: {
      name: label.slice(0, 256),
      type: "LABEL",
      namespace: "eligibility",
    },
    [roleKey]: {
      name: role.slice(0, 256),
      type: "ROLE",
      namespace: "roles",
    },
    [atsKey]: {
      name: job.companyAts.slice(0, 256),
      type: "ATS",
      namespace: "ats",
    },
  };

  const relations: HydraGraphPayload["relations"] = [
    {
      source: companyKey,
      target: jobKey,
      predicate: "posts",
      context: `${job.companyName} posts ${job.title}`,
    },
    {
      source: jobKey,
      target: labelKey,
      predicate: "labeled",
      context: `Job labeled ${label}`,
    },
    {
      source: jobKey,
      target: roleKey,
      predicate: "has_role",
      context: `Job has role ${role}`,
    },
    {
      source: companyKey,
      target: atsKey,
      predicate: "uses_ats",
      context: `${job.companyName} uses ${job.companyAts}`,
    },
  ];

  const quotes = (job.eligibilityEvidence ?? [])
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 20);

  quotes.forEach((quote, i) => {
    const key = `evidence_${i}`;
    const name = quote.length > 200 ? `${quote.slice(0, 199)}…` : quote;
    entities[key] = {
      name: name.slice(0, 256),
      type: "EVIDENCE",
      namespace: "evidence",
    };
    relations.push({
      source: jobKey,
      target: key,
      predicate: "evidence",
      context: quote.slice(0, 2000),
    });
  });

  return { entities, relations };
}

export function buildAppKnowledgeItem(job: SyncJobRow) {
  const label = job.label ?? "unclear";
  return {
    id: job.id,
    title: buildJobTitle(job),
    kind: "custom" as const,
    provider: "applicable",
    external_id: job.id,
    url: job.applyUrl,
    timestamp: (job.postedAt ?? job.firstSeenAt).toISOString(),
    fields: {
      kind: "custom" as const,
      body: buildJobText(job),
    },
    additional_metadata: {
      label,
      company_slug: job.companySlug ?? "",
      ats: job.companyAts,
      role: job.roleFamily ?? "",
      posted_at: job.postedAt?.toISOString() ?? "",
      first_seen_at: job.firstSeenAt.toISOString(),
      has_salary: job.hasSalary,
      apply_url: job.applyUrl,
    },
  };
}

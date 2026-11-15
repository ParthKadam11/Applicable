import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies } from "../db/schema.js";
import { extractFactsWithLlm } from "./extract-llm.js";
import { extractAboutSections } from "./extract-rules.js";
import { persistFacts, seedInvestorAliases } from "./persist.js";
import { enrichFromAtsJobs } from "./sources/ats.js";
import { enrichFromWebsite } from "./sources/website.js";
import {
  factsFromYcOss,
  loadYcOssIndex,
  matchYcOss,
} from "./sources/yc-oss.js";
import { enrichFoundersFromYcPage } from "./sources/yc-page.js";
import { syncCompanyEnrichmentToGraph } from "./sync-graph.js";
import type { EnrichCompanyResult, ExtractedFact, SourceKind } from "./types.js";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type EnrichRunOptions = {
  companySlug?: string;
  limit?: number;
  force?: boolean;
  skipGraph?: boolean;
  skipLlm?: boolean;
  skipWebsite?: boolean;
};

export type EnrichRunSummary = {
  enriched: number;
  skipped: number;
  failed: number;
  factsWritten: number;
  failureReasons: Record<string, number>;
  bySource: Record<SourceKind, number>;
  byType: Record<string, number>;
  results: EnrichCompanyResult[];
};

function bump(map: Record<string, number>, key: string, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

export async function enrichCompanies(
  db: Db,
  opts: EnrichRunOptions = {},
): Promise<EnrichRunSummary> {
  await seedInvestorAliases(db);

  const limit = opts.limit ?? 50;
  const staleBefore = new Date(Date.now() - STALE_MS);

  const conditions = [eq(companies.active, true)];
  if (opts.companySlug) {
    conditions.push(eq(companies.slug, opts.companySlug));
  } else if (!opts.force) {
    conditions.push(
      or(isNull(companies.enrichedAt), lt(companies.enrichedAt, staleBefore))!,
    );
  }

  const rows = await db
    .select()
    .from(companies)
    .where(and(...conditions))
    .orderBy(asc(companies.enrichedAt), asc(companies.name))
    .limit(limit);

  let ycIndex: Awaited<ReturnType<typeof loadYcOssIndex>> | null = null;
  try {
    ycIndex = await loadYcOssIndex();
  } catch (err) {
    console.warn(
      "[enrich] yc-oss index failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const summary: EnrichRunSummary = {
    enriched: 0,
    skipped: 0,
    failed: 0,
    factsWritten: 0,
    failureReasons: {},
    bySource: {
      ats_jd: 0,
      website: 0,
      yc_oss: 0,
      yc_page: 0,
      job_board: 0,
    },
    byType: {},
    results: [],
  };

  for (const co of rows) {
    const result: EnrichCompanyResult = {
      companyId: co.id,
      slug: co.slug,
      status: "failed",
      factsWritten: 0,
      sources: [],
    };
    try {
      if (
        !opts.force &&
        co.enrichedAt &&
        Date.now() - co.enrichedAt.getTime() < STALE_MS &&
        !opts.companySlug
      ) {
        result.status = "skipped";
        result.reason = "fresh";
        summary.skipped += 1;
        summary.results.push(result);
        continue;
      }

      const facts: ExtractedFact[] = [];
      const sources = new Set<SourceKind>();

      // 1. ATS JDs (local)
      try {
        const atsFacts = await enrichFromAtsJobs(db, co);
        facts.push(...atsFacts);
        if (atsFacts.length) sources.add("ats_jd");
      } catch (err) {
        bump(
          summary.failureReasons,
          `ats:${err instanceof Error ? err.message.slice(0, 60) : "err"}`,
        );
      }

      // 2. Website (skip empty / example.com placeholders)
      if (
        !opts.skipWebsite &&
        co.website &&
        !/example\.com/i.test(co.website) &&
        /^https?:\/\//i.test(co.website)
      ) {
        try {
          const web = await enrichFromWebsite(co.website);
          facts.push(...web.facts);
          if (web.facts.length) sources.add("website");
          if (web.error) bump(summary.failureReasons, `web:${web.error}`);
        } catch (err) {
          bump(
            summary.failureReasons,
            `website:${err instanceof Error ? err.message.slice(0, 60) : "err"}`,
          );
        }
      }

      // 3. yc-oss + public YC company page founders
      let ycSlug: string | null = null;
      if (ycIndex) {
        try {
          const yc = matchYcOss(ycIndex, co);
          if (yc) {
            ycSlug = yc.slug;
            const yf = factsFromYcOss(yc);
            facts.push(...yf);
            if (yf.length) sources.add("yc_oss");
          }
        } catch (err) {
          bump(
            summary.failureReasons,
            `yc:${err instanceof Error ? err.message.slice(0, 60) : "err"}`,
          );
        }
      }
      if (ycSlug) {
        try {
          const founders = await enrichFoundersFromYcPage(ycSlug);
          facts.push(...founders.facts);
          if (founders.facts.length) sources.add("yc_page");
          if (founders.error) bump(summary.failureReasons, `yc_page:${founders.error}`);
        } catch (err) {
          bump(
            summary.failureReasons,
            `yc_page:${err instanceof Error ? err.message.slice(0, 60) : "err"}`,
          );
        }
      }

      // 4. Optional LLM on combined about text (best-effort)
      if (!opts.skipLlm && facts.length < 3) {
        const sampleText = facts.map((f) => f.quote).join("\n").slice(0, 2000);
        if (sampleText.length > 80) {
          const llm = await extractFactsWithLlm({
            text: sampleText,
            sourceUrl: co.website || `company:${co.id}`,
            sourceKind: "ats_jd",
            companyName: co.name,
          });
          if (llm.facts.length) {
            facts.push(...llm.facts);
          } else if (llm.skipped) {
            bump(summary.failureReasons, `llm:${llm.skipped}`);
          }
        }
      }

      // Dedupe by type+value
      const seen = new Set<string>();
      const unique = facts.filter((f) => {
        const k = `${f.factType}|${f.value.toLowerCase()}|${f.sourceUrl}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const written = await persistFacts(db, co.id, unique);
      for (const f of unique) {
        bump(summary.bySource, f.sourceKind);
        bump(summary.byType, f.factType);
      }

      if (!opts.skipGraph) {
        const g = await syncCompanyEnrichmentToGraph(db, co.id);
        if (!g.ok && g.error) {
          bump(summary.failureReasons, `graph:${g.error.slice(0, 80)}`);
        }
      }

      result.status = "enriched";
      result.factsWritten = written;
      result.sources = [...sources];
      summary.enriched += 1;
      summary.factsWritten += written;
      summary.results.push(result);
      console.log(
        `[enrich] ${co.slug ?? co.name}: facts=${written} sources=${[...sources].join(",") || "-"}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 120) : String(err);
      result.status = "failed";
      result.reason = reason;
      summary.failed += 1;
      bump(summary.failureReasons, reason);
      summary.results.push(result);
      console.warn(`[enrich] FAIL ${co.slug ?? co.name}: ${reason}`);
    }
  }

  void extractAboutSections;
  void sql;
  return summary;
}

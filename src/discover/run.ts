import { config } from "../config.js";
import type { Db } from "../db/client.js";
import { sortByDiscoveryPriority } from "./early-career-signal.js";
import { verifyAndPromote, type PromoteStats } from "./promote.js";
import { discoverArbeitnow } from "./sources/arbeitnow.js";
import { discoverEarlyCareerSeed } from "./sources/early-career-seed.js";
import { discoverHimalayas } from "./sources/himalayas.js";
import { discoverHnHiring } from "./sources/hn.js";
import {
  discoverIndiaStartups,
  discoverYcIndia,
} from "./sources/india-startups.js";
import { discoverJobicy } from "./sources/jobicy.js";
import { discoverRemoteOk } from "./sources/remoteok.js";
import { discoverRemotive } from "./sources/remotive.js";
import { discoverYc } from "./sources/yc.js";
import type { DiscoverSource, DiscoveredCompany } from "./types.js";
import { upsertCandidates } from "./upsert-candidates.js";

export interface DiscoverRunResult {
  foundBySource: Record<DiscoverSource, number>;
  upserted: number;
  promote: PromoteStats;
}

const EMPTY_COUNTS = (): Record<DiscoverSource, number> => ({
  yc: 0,
  yc_india: 0,
  india_startups: 0,
  hn_hiring: 0,
  himalayas: 0,
  remoteok: 0,
  remotive: 0,
  jobicy: 0,
  arbeitnow: 0,
  common_crawl: 0,
  early_career_seed: 0,
});

export async function runDiscovery(
  db: Db,
  options?: {
    sources?: DiscoverSource[];
    promoteLimit?: number;
    concurrency?: number;
    ingest?: boolean;
  },
): Promise<DiscoverRunResult> {
  const wanted = new Set(
    options?.sources ??
      ([
        "yc",
        "yc_india",
        "india_startups",
        "early_career_seed",
        "hn_hiring",
        "himalayas",
        "remoteok",
        "remotive",
        "jobicy",
        "arbeitnow",
      ] as DiscoverSource[]),
  );

  const foundBySource = EMPTY_COUNTS();
  const all: DiscoveredCompany[] = [];

  async function runSource(
    key: DiscoverSource,
    fn: () => Promise<DiscoveredCompany[]>,
  ) {
    if (!wanted.has(key)) return;
    try {
      const rows = await fn();
      foundBySource[key] = rows.length;
      all.push(...rows);
    } catch (err) {
      console.warn(
        `[discover:${key}] failed:`,
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
      foundBySource[key] = 0;
    }
  }

  await runSource("yc", discoverYc);
  await runSource("yc_india", discoverYcIndia);
  await runSource("india_startups", discoverIndiaStartups);
  await runSource("early_career_seed", discoverEarlyCareerSeed);
  await runSource("hn_hiring", discoverHnHiring);
  await runSource("himalayas", discoverHimalayas);
  await runSource("remoteok", discoverRemoteOk);
  await runSource("remotive", discoverRemotive);
  await runSource("jobicy", discoverJobicy);
  await runSource("arbeitnow", discoverArbeitnow);

  const prioritized = sortByDiscoveryPriority(all);
  const upserted = await upsertCandidates(db, prioritized);
  console.log(`[discover] upserted ${upserted} candidate rows`);

  const promote = await verifyAndPromote(db, {
    limit: options?.promoteLimit ?? config.DISCOVER_PROMOTE_LIMIT,
    concurrency: options?.concurrency ?? config.DISCOVER_PROMOTE_CONCURRENCY,
    ingest: options?.ingest,
  });

  return { foundBySource, upserted, promote };
}

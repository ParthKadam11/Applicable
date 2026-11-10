import { config } from "../config.js";
import type { Db } from "../db/client.js";
import { verifyAndPromote, type PromoteStats } from "./promote.js";
import { discoverHimalayas } from "./sources/himalayas.js";
import { discoverHnHiring } from "./sources/hn.js";
import { discoverRemoteOk } from "./sources/remoteok.js";
import { discoverYc } from "./sources/yc.js";
import type { DiscoverSource, DiscoveredCompany } from "./types.js";
import { upsertCandidates } from "./upsert-candidates.js";

export interface DiscoverRunResult {
  foundBySource: Record<DiscoverSource, number>;
  upserted: number;
  promote: PromoteStats;
}

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
      (["yc", "hn_hiring", "himalayas", "remoteok"] as DiscoverSource[]),
  );

  const foundBySource: Record<DiscoverSource, number> = {
    yc: 0,
    hn_hiring: 0,
    himalayas: 0,
    remoteok: 0,
  };

  const all: DiscoveredCompany[] = [];

  if (wanted.has("yc")) {
    const yc = await discoverYc();
    foundBySource.yc = yc.length;
    all.push(...yc);
  }
  if (wanted.has("hn_hiring")) {
    const hn = await discoverHnHiring();
    foundBySource.hn_hiring = hn.length;
    all.push(...hn);
  }
  if (wanted.has("himalayas")) {
    const him = await discoverHimalayas();
    foundBySource.himalayas = him.length;
    all.push(...him);
  }
  if (wanted.has("remoteok")) {
    const rok = await discoverRemoteOk();
    foundBySource.remoteok = rok.length;
    all.push(...rok);
  }

  const upserted = await upsertCandidates(db, all);
  console.log(`[discover] upserted ${upserted} candidate rows`);

  const promote = await verifyAndPromote(db, {
    limit: options?.promoteLimit ?? config.DISCOVER_PROMOTE_LIMIT,
    concurrency: options?.concurrency ?? config.DISCOVER_PROMOTE_CONCURRENCY,
    ingest: options?.ingest,
  });

  return { foundBySource, upserted, promote };
}

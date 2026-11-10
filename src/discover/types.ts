import type { Ats } from "../ats/types.js";

export type DiscoverSource = "yc" | "hn_hiring" | "himalayas" | "remoteok";

export interface DiscoveredCompany {
  name: string;
  domain?: string | null;
  source: DiscoverSource;
  /** Careers / ATS / posting URL if known. */
  evidenceUrl?: string | null;
  /** Pre-parsed ATS from a job-board URL. */
  ats?: Ats | null;
  atsSlug?: string | null;
}

export interface AtsHit {
  ats: Ats;
  atsSlug: string;
  url: string;
}

export const MAX_JOBS_FOR_PROMOTE = 500;

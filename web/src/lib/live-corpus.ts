import type { JobRow, Stats } from "@/lib/api";
import { ELIGIBILITY_COLORS } from "@/lib/constants";
import { evidenceQuote } from "@/lib/format";

export const CORPUS_FEED_LABELS: Record<string, string> = {
  open: "Open worldwide",
  india_remote: "Remote from India",
};

export type CorpusStat = {
  key: string;
  label: string;
  value: number;
};

/** Four live corpus metrics; omit non-positive values. */
export function corpusStatsFrom(stats: Stats | null): CorpusStat[] | null {
  if (!stats) return null;
  const cells: CorpusStat[] = [
    {
      key: "companies",
      label: "Companies tracked",
      value: stats.companies_active,
    },
    {
      key: "roles",
      label: "Open tech roles",
      value: stats.tech_open_jobs,
    },
    {
      key: "india_remote",
      label: "Remote from India",
      value: stats.by_eligibility?.india_remote ?? 0,
    },
    {
      key: "open",
      label: "Open worldwide",
      value: stats.by_eligibility?.open ?? 0,
    },
  ];
  const live = cells.filter((c) => Number.isFinite(c.value) && c.value > 0);
  return live.length >= 2 ? live : null;
}

export type CorpusCard = {
  id: string;
  title: string;
  company: string;
  companyWebsite: string | null;
  location: string | null;
  eligibility: string;
  label: string;
  labelColor: string;
  quote: string;
  postedAgo: string;
  href: string;
};

export function formatPostedAgo(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string {
  if (!iso) return "Recently posted";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Recently posted";
  const days = Math.max(0, Math.floor((nowMs - t) / 86_400_000));
  if (days < 1) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "Posted 1 month ago" : `Posted ${months} months ago`;
}

export function toCorpusCards(jobs: JobRow[]): CorpusCard[] {
  const out: CorpusCard[] = [];
  for (const job of jobs) {
    const quote = evidenceQuote(job.evidence);
    if (!quote || !job.eligibility) continue;
    const label = CORPUS_FEED_LABELS[job.eligibility];
    if (!label) continue;
    out.push({
      id: job.id,
      title: job.title,
      company: job.company,
      companyWebsite: job.company_website ?? null,
      location: job.location,
      eligibility: job.eligibility,
      label,
      labelColor: ELIGIBILITY_COLORS[job.eligibility] ?? "#8fa3b5",
      quote: quote.length > 120 ? `${quote.slice(0, 117)}…` : quote,
      postedAgo: formatPostedAgo(job.posted_at ?? job.last_seen_at),
      href: `/jobs/${job.id}`,
    });
  }
  return out;
}

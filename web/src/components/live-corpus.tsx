import { BrowseJobsLink } from "@/components/browse-jobs-link";
import { LiveCorpusFeed } from "@/components/live-corpus-feed";
import { LiveCorpusStats } from "@/components/live-corpus-stats";
import type { JobRow, Stats } from "@/lib/api";
import { formatLastUpdatedAgo } from "@/lib/footer";
import { corpusStatsFrom, toCorpusCards } from "@/lib/live-corpus";

type Props = {
  stats: Stats | null;
  jobs: JobRow[];
};

/** Live corpus proof section — stats + scrolling evidence-backed jobs. */
export function LiveCorpus({ stats, jobs }: Props) {
  const corpusStats = corpusStatsFrom(stats);
  const cards = toCorpusCards(jobs);
  const updated = formatLastUpdatedAgo(stats?.last_ingestion_at);

  if (!corpusStats && cards.length === 0) return null;

  return (
    <section
      id="live"
      className="cv-auto scroll-mt-24 border-t border-line bg-white"
      aria-label="Live corpus"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mark-deep">
          Live corpus
        </p>
        <h2 className="mt-2 max-w-2xl text-balance font-display text-[1.75rem] leading-[1.15] text-ink sm:text-4xl">
          Real roles. Real quotes. Updated continuously.
        </h2>
        <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-mute">
          A live slice of Applicable’s India-eligibility graph — companies,
          open tech roles, and the line from each posting that proves the label.
        </p>

        {corpusStats ? (
          <div className="mt-8 sm:mt-10">
            <LiveCorpusStats stats={corpusStats} updatedLabel={updated} />
          </div>
        ) : null}

        {cards.length > 0 ? (
          <div className="mt-8 sm:mt-10">
            <LiveCorpusFeed cards={cards} />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-pretty text-[13px] leading-relaxed text-mute">
                Pulled live from company hiring boards. Every label backed by a
                quote from the posting.
              </p>
              <BrowseJobsLink className="btn-ghost w-full shrink-0 touch-manipulation sm:w-auto">
                Browse all jobs
              </BrowseJobsLink>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrowseJobsLink } from "@/components/browse-jobs-link";
import { CompanyLogo } from "@/components/company-logo";
import { ELIGIBILITY_COLORS } from "@/lib/constants";
import { getJobById } from "@/lib/jobs-api";
import { CORPUS_FEED_LABELS, formatPostedAgo } from "@/lib/live-corpus";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Job" };
  const job = await getJobById(id);
  if (!job) return { title: "Job not found" };
  return {
    title: `${job.title} · ${job.company.name}`,
    description: job.evidence[0]
      ? `India eligibility proof: “${job.evidence[0]}”`
      : `${job.title} at ${job.company.name}`,
  };
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const job = await getJobById(id);
  if (!job) notFound();

  const labelKey = job.label ?? "";
  const label =
    CORPUS_FEED_LABELS[labelKey] ??
    labelKey.replace(/_/g, " ");
  const color = ELIGIBILITY_COLORS[labelKey] ?? "#8fa3b5";
  const quote = job.evidence[0] ?? null;

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-8 sm:pt-14">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mark-deep">
          Job
        </p>
        <div className="mt-4 flex items-start gap-4">
          <CompanyLogo company={job.company.name} size={48} />
          <div className="min-w-0">
            {label ? (
              <span
                className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink"
                style={{
                  background: `color-mix(in srgb, ${color} 22%, white)`,
                }}
              >
                {label}
              </span>
            ) : null}
            <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
              {job.title}
            </h1>
            <p className="mt-1 text-[15px] text-mute">
              {job.company.name}
              {job.locationText ? ` · ${job.locationText}` : ""}
            </p>
            <p className="mt-2 text-[12px] text-mute">
              {formatPostedAgo(job.postedAt ?? job.lastSeenAt)}
            </p>
          </div>
        </div>

        {quote ? (
          <blockquote className="mt-10 border-l-4 border-sun bg-white px-5 py-4 text-[1.05rem] leading-relaxed text-ink shadow-[0_1px_0_var(--line)]">
            “{quote}”
            <footer className="mt-2 text-[12px] text-mute">
              Quoted from the posting — this is why Applicable labeled it{" "}
              {label || "this way"}.
            </footer>
          </blockquote>
        ) : (
          <p className="mt-10 text-sm text-mute">
            No evidence quote stored for this role.
          </p>
        )}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ink touch-manipulation"
          >
            View original posting
          </a>
          <BrowseJobsLink className="btn-ghost touch-manipulation sm:w-auto">
            Browse all jobs
          </BrowseJobsLink>
        </div>

        <p className="mt-8 text-[13px] text-mute">
          <Link href="/#live" className="text-mark-deep hover:underline">
            ← Back to live corpus
          </Link>
        </p>
      </main>
    </div>
  );
}

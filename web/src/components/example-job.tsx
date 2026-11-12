import type { JobRow } from "@/lib/api";
import { ELIGIBILITY_LABELS } from "@/lib/constants";
import { evidenceQuote } from "@/lib/format";

export function ExampleJob({ job }: { job: JobRow | null }) {
  const quote = job ? evidenceQuote(job.evidence) : null;
  const label = job?.eligibility
    ? (ELIGIBILITY_LABELS[job.eligibility] ?? job.eligibility)
    : "—";

  return (
    <section className="border-t border-line bg-white">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
        <p className="font-mono text-[11px] uppercase text-mark-deep">
          Example
        </p>
        <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
          Proof, not vibes.
        </h2>

        {!job ? (
          <p className="mt-8 font-mono text-sm text-mute">—</p>
        ) : (
          <div className="mt-8 max-w-2xl rounded-2xl border border-line bg-paper p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eaf4ff] px-2.5 py-0.5 font-mono text-[10px] uppercase text-mark-deep">
                {label}
              </span>
              {job.location ? (
                <span className="font-mono text-[10px] uppercase text-mute">
                  {job.location}
                </span>
              ) : null}
            </div>
            <h3 className="mt-4 font-display text-2xl leading-snug text-ink">
              {job.title}
            </h3>
            <p className="mt-1 text-[15px] text-mute">{job.company}</p>
            {quote ? (
              <blockquote className="mt-6 border-l-4 border-sun pl-4 text-base leading-relaxed text-ink sm:text-lg">
                “{quote}”
              </blockquote>
            ) : (
              <p className="mt-6 font-mono text-sm text-mute">
                No evidence quote.
              </p>
            )}
            <a
              href={job.apply_url}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex font-mono text-[11px] uppercase text-mark-deep underline-offset-4 hover:underline"
            >
              View posting →
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

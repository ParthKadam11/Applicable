import type { JobRow } from "@/lib/api";
import { ELIGIBILITY_LABELS } from "@/lib/constants";
import { evidenceQuote } from "@/lib/format";

export function ExampleJob({ job }: { job: JobRow | null }) {
  const quote = job ? evidenceQuote(job.evidence) : null;
  const label = job?.eligibility
    ? (ELIGIBILITY_LABELS[job.eligibility] ?? job.eligibility)
    : "—";

  return (
    <section className="border-t border-white/[0.06] bg-gradient-to-b from-emerald-500/[0.03] to-transparent">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Example
        </p>
        <h2 className="mt-3 font-display text-3xl tracking-tight text-zinc-50 sm:text-4xl">
          Proof, not vibes.
        </h2>
        <p className="mt-4 max-w-xl text-base text-zinc-400">
          A live India-eligible role from the corpus — title, label, and the
          quote that justified it.
        </p>

        <article className="mt-10 max-w-2xl rounded-xl border border-white/[0.08] bg-[#0c0c0e]/80 p-6 sm:p-8">
          {!job ? (
            <p className="text-sm text-zinc-500">
              Couldn’t load an example right now. Check the dashboard once the
              API is reachable.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                  {label}
                </span>
                {job.location ? (
                  <span className="text-xs text-zinc-500">{job.location}</span>
                ) : null}
              </div>
              <h3 className="mt-4 text-xl font-medium tracking-tight text-zinc-50">
                {job.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">{job.company}</p>
              {quote ? (
                <blockquote className="mt-6 border-l-2 border-emerald-400/50 pl-4 text-sm leading-relaxed text-zinc-300">
                  <span className="text-emerald-300/90">“{quote}”</span>
                </blockquote>
              ) : (
                <p className="mt-6 text-sm text-zinc-500">No evidence quote on this row.</p>
              )}
              <a
                href={job.apply_url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex text-sm text-emerald-300 transition hover:text-emerald-200"
              >
                View posting →
              </a>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

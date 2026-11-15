const STEPS = [
  {
    title: "Map the open market",
    body: "Discover companies and ingest every open tech role from public ATS boards, kept fresh.",
  },
  {
    title: "Prove India eligibility",
    body: "Tag who can apply from India, with the exact JD quote behind every label.",
  },
  {
    title: "Query it from your agent",
    body: "One MCP connection for search, stats, and evidence in the tools you already use.",
  },
] as const;

/** Quiet three-step explainer under the agents strip. */
export function HowItWorks() {
  return (
    <section
      id="how"
      className="cv-auto scroll-mt-24 border-b border-line bg-soft"
    >
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
        <h2 className="max-w-2xl text-balance font-display text-[1.75rem] leading-[1.15] text-ink sm:text-4xl">
          What Applicable actually does
        </h2>

        <ol className="mt-12 grid gap-8 border-t border-line/80 pt-12 sm:mt-14 sm:grid-cols-3 sm:gap-8 sm:pt-14 lg:gap-12">
          {STEPS.map((step, i) => (
            <li key={step.title} className="min-w-0">
              <span className="text-[11px] uppercase tracking-wide text-mute">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-xl leading-snug text-ink sm:text-[1.35rem]">
                {step.title}
              </h3>
              <p className="mt-2 max-w-[17rem] text-pretty text-sm leading-relaxed text-mute">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

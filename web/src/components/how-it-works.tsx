const STEPS = [
  {
    title: "Map the open market",
    body: "We discover companies and ingest every open tech role from public ATS boards like Greenhouse, Lever, and Ashby, then keep the corpus fresh.",
  },
  {
    title: "Prove India eligibility",
    body: "Rules and models tag who can actually apply from India, and attach the exact quote from the JD so you can trust the label.",
  },
  {
    title: "Query it from your agent",
    body: "One MCP connection puts search, stats, and evidence in Claude, Cursor, Codex, and the rest, or open the live dashboard.",
  },
] as const;

/** Quiet three-step explainer under Integrations. */
export function HowItWorks() {
  return (
    <section
      id="how"
      className="cv-auto scroll-mt-24 border-b border-line bg-soft"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8 sm:py-20">
        <h2 className="text-balance font-display text-[1.75rem] leading-[1.15] text-ink sm:text-4xl">
          What Applicable actually does
        </h2>

        <ol className="mt-10 grid gap-10 sm:mt-12 sm:grid-cols-3 sm:gap-10">
          {STEPS.map((step, i) => (
            <li key={step.title} className="min-w-0">
              <span className="text-[11px] uppercase tracking-wide text-mute">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-xl text-ink sm:text-[1.35rem]">
                {step.title}
              </h3>
              <p className="mt-2 max-w-sm text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

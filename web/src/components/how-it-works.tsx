const STEPS = [
  {
    n: "01",
    title: "Collect",
    body: "We watch public company job boards (Greenhouse, Lever, Ashby) and keep open tech roles fresh.",
  },
  {
    n: "02",
    title: "Classify",
    body: "Each posting is tagged for India eligibility — with the exact line from the JD that proves it.",
  },
  {
    n: "03",
    title: "Query",
    body: "Ask your AI over MCP, or browse the dashboard. No guesswork — just live boards and quotes.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          How it works
        </p>
        <h2 className="mt-3 font-display text-3xl tracking-tight text-zinc-50 sm:text-4xl">
          Three steps. No fluff.
        </h2>
        <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((s) => (
            <li key={s.n} className="relative">
              <span className="font-mono text-xs text-emerald-400/70">{s.n}</span>
              <h3 className="mt-3 text-lg font-medium text-zinc-50">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

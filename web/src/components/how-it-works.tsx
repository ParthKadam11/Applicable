const STEPS = [
  {
    n: "01",
    title: "Collect",
    body: "Public boards on Greenhouse, Lever, Ashby — open tech roles kept current.",
    tint: "bg-mark-soft",
  },
  {
    n: "02",
    title: "Classify",
    body: "India eligibility tagged with the exact line from the JD that proves it.",
    tint: "bg-sun-soft",
  },
  {
    n: "03",
    title: "Query",
    body: "Ask your AI over MCP, or open the dashboard. Live boards, quoted proof.",
    tint: "bg-[#e8f4ff]",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
        <p className="font-mono text-[11px] uppercase text-mark-deep">
          How it works
        </p>
        <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
          Three steps. Done.
        </h2>

        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={`rounded-2xl border border-line p-5 ${s.tint}`}
            >
              <span className="font-mono text-[11px] uppercase text-mark-deep">
                {s.n}
              </span>
              <h3 className="mt-3 font-display text-xl text-ink">{s.title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-mute">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

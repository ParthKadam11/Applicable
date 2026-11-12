import type { LlmStatus } from "@/lib/api";
import { formatIst } from "@/lib/format";

function statusLabel(p: LlmStatus["providers"][number]): {
  text: string;
  tone: "ok" | "warn" | "mute";
} {
  if (!p.configured) return { text: "Add key", tone: "mute" };
  if (p.exhausted) return { text: "Exhausted", tone: "warn" };
  return { text: "Ready", tone: "ok" };
}

/** Classification providers: BYOK only (keys on the server, never in the browser). */
export function ByokPanel({ status }: { status: LlmStatus | null }) {
  const providers = status?.providers ?? [];

  return (
    <section className="rounded-2xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-ink">Classification · BYOK</h2>
          <span className="text-[11px] uppercase tracking-wide text-mute">
            Your keys
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-pretty text-sm text-mute">
          {status?.summary ??
            "Unclear roles use Gemini / Groq / OpenRouter with keys you set on the server."}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {providers.length === 0 ? (
          <li className="px-4 py-5 text-sm text-mute sm:px-5">-</li>
        ) : (
          providers.map((p) => {
            const s = statusLabel(p);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">{p.label}</p>
                  <p className="mt-0.5 truncate text-[12px] text-mute">{p.model}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[11px] uppercase tracking-wide ${
                      s.tone === "ok"
                        ? "text-mark-deep"
                        : s.tone === "warn"
                          ? "text-sun"
                          : "text-mute"
                    }`}
                  >
                    {s.text}
                  </p>
                  {p.exhausted_until ? (
                    <p className="mt-0.5 text-[11px] text-mute">
                      until {formatIst(p.exhausted_until)} IST
                    </p>
                  ) : p.configured ? (
                    <p className="mt-0.5 text-[11px] text-mute">
                      {p.calls_today} calls today
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

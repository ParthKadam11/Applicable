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
    <section className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg tracking-tight text-ink">
            Classification · BYOK
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
            Server keys
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-pretty text-[13px] text-mute">
          {status?.summary ??
            "Unclear roles use Gemini / Groq / OpenRouter with keys you set on the server."}
        </p>
      </div>

      <ul>
        {providers.length === 0 ? (
          <li className="py-4 text-sm text-mute">—</li>
        ) : (
          providers.map((p) => {
            const s = statusLabel(p);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line/50 py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
                    {p.label}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-mute">
                    {p.model}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
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

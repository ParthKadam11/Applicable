export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Applicable % = (open + india_remote) / tech_open_jobs */
export function applicablePct(
  open: number | undefined,
  indiaRemote: number | undefined,
  techOpen: number | undefined,
): number | null {
  if (
    open == null ||
    indiaRemote == null ||
    techOpen == null ||
    !Number.isFinite(techOpen) ||
    techOpen <= 0
  ) {
    return null;
  }
  return ((open + indiaRemote) / techOpen) * 100;
}

export function formatIst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function evidenceQuote(
  evidence: unknown,
): string | null {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  const first = evidence[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object" && "quote" in first) {
    const q = (first as { quote?: unknown }).quote;
    if (typeof q === "string" && q.trim()) return q.trim();
  }
  if (first && typeof first === "object" && "text" in first) {
    const t = (first as { text?: unknown }).text;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return null;
}

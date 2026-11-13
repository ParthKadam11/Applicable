/** Shared salary display — never show funding figures or parser junk. */

export function isPlausibleCompensation(
  min: number | null | undefined,
  max: number | null | undefined,
  period: string | null | undefined,
): boolean {
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo == null || hi == null) return false;
  if (!(lo > 0) || hi < lo) return false;

  const p = (period ?? "year").toLowerCase();
  if (p === "hour") return lo >= 10 && hi <= 2_000;
  if (p === "month") return lo >= 800 && hi <= 40_000;
  return lo >= 15_000 && hi <= 2_000_000;
}

export function formatSalaryText(row: {
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  compensationPeriod: string | null;
}): string | null {
  let period = row.compensationPeriod?.trim() || null;
  const min = row.compensationMin;
  const max = row.compensationMax;

  // Annual figures wrongly tagged as monthly (e.g. "monthly" elsewhere in JD).
  if (
    period?.toLowerCase() === "month" &&
    min != null &&
    min >= 20_000 &&
    isPlausibleCompensation(min, max, "year")
  ) {
    period = "year";
  }

  if (!isPlausibleCompensation(min, max, period)) {
    return null;
  }

  const cur = row.compensationCurrency?.trim() || "USD";
  const suffix = period ? ` / ${period}` : "";
  const lo = min!;
  const hi = max!;

  if (lo === hi) {
    return `${cur} ${lo.toLocaleString()}${suffix}`;
  }
  return `${cur} ${lo.toLocaleString()}–${hi.toLocaleString()}${suffix}`;
}

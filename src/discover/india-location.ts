/** True when locations/regions text indicates India (not Indianapolis etc.). */
export function isIndiaLocationText(...parts: Array<string | null | undefined>): boolean {
  const text = parts.filter(Boolean).join(" | ");
  if (!text.trim()) return false;
  if (
    /\b(?:India|Bengaluru|Bangalore|Hyderabad|Mumbai|Pune|Delhi|Noida|Gurugram|Gurgaon|Chennai|Kolkata|Ahmedabad|Jaipur|Kochi|Chandigarh|Remote[\s-]*IN)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  // Region tag "India" / "South Asia" from YC — require India specifically for South Asia
  if (/(?:^|[|,;/])\s*India\s*(?:$|[|,;/])/i.test(text)) return true;
  return false;
}

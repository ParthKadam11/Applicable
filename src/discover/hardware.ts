/**
 * YC industry/tag filter for hardware & manufacturing companies.
 * Software/SaaS with a loose "automation" mention alone is not enough.
 */
const HARDWARE_TAG = /^(hard tech|hardware|manufacturing|robotics|semiconductor|drones?|electronics)$/i;

const HARDWARE_PHRASE =
  /\b(?:hard tech|hardware|manufactur(?:ing|ed)?|robotics|semiconductor|drones?|electronics|manufacturing and robotics)\b/i;

export function isHardwareManufacturing(input: {
  industries?: string[] | null;
  tags?: string[] | null;
  subindustry?: string | null;
  industry?: string | null;
}): boolean {
  const tags = input.tags ?? [];
  if (tags.some((t) => HARDWARE_TAG.test(t.trim()))) return true;

  const industries = input.industries ?? [];
  for (const ind of industries) {
    if (HARDWARE_PHRASE.test(ind)) return true;
  }

  if (input.subindustry && HARDWARE_PHRASE.test(input.subindustry)) return true;
  if (input.industry && HARDWARE_PHRASE.test(input.industry)) {
    // "Industrials" alone is broad; only filter when paired with manuf/robotics phrasing.
    if (/manufactur|robotics|hardware|hard tech/i.test(input.industry)) {
      return true;
    }
  }

  return false;
}

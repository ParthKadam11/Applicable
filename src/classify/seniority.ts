import type { Seniority } from "./types.js";
import { sentenceMatching } from "./text.js";

export type SeniorityResult = {
  seniority: Seniority;
  evidence: string | null;
  yearsMin: number | null;
  yearsMax: number | null;
};

/** Title signals checked first, higher rank wins within the same pass. */
const TITLE_PATTERNS: Array<{ level: Seniority; re: RegExp }> = [
  // staff+ first so "Senior Staff" / "Principal" land correctly
  { level: "staff", re: /\b(?:staff|principal)\b/i },
  {
    level: "senior",
    re: /\b(?:senior|sr\.?|lead|head|manager|director)\b/i,
  },
  {
    level: "intern",
    re: /\b(?:intern(?:ship)?|trainee|apprentice)\b/i,
  },
  {
    level: "entry",
    re: /\b(?:junior|jr\.?|associate|fresher|early[\s-]?career)\b/i,
  },
  {
    level: "entry",
    re: /\b(?:new[\s-]?grad(?:uate)?|graduate(?:\s+(?:engineer|developer|software|program))?|entry[\s-]?level|campus)\b/i,
  },
  // SDE I / SE I / Engineer I / Software Engineer 1
  {
    level: "entry",
    re: /\b(?:SDE[\s-]?I\b|SDE[\s-]?1\b|SE[\s-]?I\b|SE[\s-]?1\b|Software\s+Development\s+Engineer\s+[I1]\b|(?:Software\s+)?Engineer\s+[I1]\b)/i,
  },
  {
    level: "mid",
    re: /\b(?:mid[\s-]?level|mid[\s-]?career|SDE[\s-]?II\b|SDE[\s-]?2\b|SE[\s-]?II\b|Engineer\s+II\b)/i,
  },
];

/**
 * Years-of-experience phrases from JD. Prefer explicit ranges.
 * Returns [min, max] when parseable (max null = open-ended like "3+").
 */
const YOE_PATTERNS: Array<{
  re: RegExp;
  parse: (m: RegExpMatchArray) => { min: number; max: number | null };
}> = [
  {
    re: /\b(\d+)\s*[-–—to]+\s*(\d+)\s*\+?\s*(?:years?|yrs?)\b/i,
    parse: (m) => ({ min: Number(m[1]), max: Number(m[2]) }),
  },
  {
    re: /\b(\d+)\s*\+\s*(?:years?|yrs?)\b/i,
    parse: (m) => ({ min: Number(m[1]), max: null }),
  },
  {
    re: /\bat least\s+(\d+)\s*(?:years?|yrs?)\b/i,
    parse: (m) => ({ min: Number(m[1]), max: null }),
  },
  {
    re: /\b(\d+)\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)\b/i,
    parse: (m) => ({ min: Number(m[1]), max: Number(m[1]) }),
  },
];

/** Soft early-career phrases in the JD (when title has no signal). */
const DESC_ENTRY_PATTERNS: RegExp[] = [
  /\bfreshers?\s+welcome\b/i,
  /\b(?:open\s+to\s+)?new\s+graduates?\b/i,
  /\bcampus\s+(?:hire|hiring|recruit)\b/i,
  /\bearly[\s-]?career\b/i,
  /\bentry[\s-]?level\b/i,
  /\b0[\s-–—to]+2\s*(?:years?|yrs?)\b/i,
  // Avoid matching "remote-first role"
  /(?<![\w-])first\s+(?:job|role)\b/i,
];

function yoeToSeniority(min: number, max: number | null): Seniority {
  if (max != null) {
    if (max <= 2) return "entry";
    if (min >= 8) return "staff";
    if (min >= 5 || max >= 6) return "senior";
    // e.g. 2–4, 3–5
    return "mid";
  }
  // Open-ended "N+ years"
  if (min <= 1) return "entry"; // "0+" / "1+"
  if (min <= 4) return "mid";
  if (min <= 7) return "senior";
  return "staff";
}

function parseYoe(text: string): {
  min: number;
  max: number | null;
  evidence: string;
} | null {
  for (const { re, parse } of YOE_PATTERNS) {
    const sentence = sentenceMatching(text, re);
    if (!sentence) continue;
    const m = sentence.match(re);
    if (!m) continue;
    const { min, max } = parse(m);
    if (!Number.isFinite(min) || min < 0 || min > 40) continue;
    if (max != null && (!Number.isFinite(max) || max < min || max > 40)) continue;
    return { min, max, evidence: sentence };
  }
  return null;
}

function fromTitle(title: string): SeniorityResult | null {
  for (const { level, re } of TITLE_PATTERNS) {
    if (re.test(title)) {
      const evidence = sentenceMatching(title, re) ?? title;
      return {
        seniority: level,
        evidence,
        yearsMin: null,
        yearsMax: null,
      };
    }
  }
  return null;
}

function fromDescriptionPhrases(descriptionText: string): SeniorityResult | null {
  for (const re of DESC_ENTRY_PATTERNS) {
    const sentence = sentenceMatching(descriptionText, re);
    if (!sentence) continue;
    return {
      seniority: "entry",
      evidence: sentence,
      yearsMin: null,
      yearsMax: null,
    };
  }
  return null;
}

/**
 * Title-first seniority, then JD years-of-experience / early-career phrases.
 * Levels: intern | entry | mid | senior | staff | unknown
 * ("staff" covers staff+ / principal). Title wins on conflict with YoE.
 */
export function classifySeniority(
  title: string,
  descriptionText = "",
): SeniorityResult {
  const titled = fromTitle(title);
  if (titled) {
    const yoe = parseYoe(descriptionText);
    if (yoe) {
      return {
        ...titled,
        yearsMin: yoe.min,
        yearsMax: yoe.max,
      };
    }
    return titled;
  }

  const yoe = parseYoe(`${title}\n${descriptionText}`);
  if (yoe) {
    return {
      seniority: yoeToSeniority(yoe.min, yoe.max),
      evidence: yoe.evidence,
      yearsMin: yoe.min,
      yearsMax: yoe.max,
    };
  }

  const soft = fromDescriptionPhrases(descriptionText);
  if (soft) return soft;

  return {
    seniority: "unknown",
    evidence: null,
    yearsMin: null,
    yearsMax: null,
  };
}

/** Early career = intern + entry + mid with max YoE <= 2. */
export function isEarlyCareer(input: {
  seniority: string | null | undefined;
  yearsMax?: number | null;
  yearsMin?: number | null;
}): boolean {
  const s = input.seniority ?? "unknown";
  if (s === "intern" || s === "entry" || s === "junior") return true;
  if (s === "mid") {
    if (input.yearsMax != null && input.yearsMax <= 2) return true;
    if (
      input.yearsMax == null &&
      input.yearsMin != null &&
      input.yearsMin <= 2
    ) {
      return true;
    }
  }
  return false;
}

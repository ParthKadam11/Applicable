import { fetchText } from "../utils/http.js";
import type { Ats } from "../ats/types.js";

interface Detection {
  ats: Ats;
  ats_slug: string;
  url: string;
}

const PATTERNS: Array<{
  ats: Ats;
  regex: RegExp;
  slugGroup: number;
}> = [
  {
    ats: "ashby",
    regex: /https?:\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "greenhouse",
    regex: /https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "lever",
    regex: /https?:\/\/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "workable",
    regex: /https?:\/\/apply\.workable\.com\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "recruitee",
    regex: /https?:\/\/([a-zA-Z0-9_-]+)\.recruitee\.com/gi,
    slugGroup: 1,
  },
  {
    ats: "personio",
    regex: /https?:\/\/([a-zA-Z0-9_-]+)\.jobs\.personio\.(?:de|com)/gi,
    slugGroup: 1,
  },
];

export function detectAtsFromHtml(html: string, pageUrl?: string): Detection[] {
  const found = new Map<string, Detection>();

  const sources = [html];
  if (pageUrl) sources.push(pageUrl);

  for (const source of sources) {
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(source)) !== null) {
        const slug = match[pattern.slugGroup];
        if (!slug) continue;
        const key = `${pattern.ats}:${slug.toLowerCase()}`;
        if (!found.has(key)) {
          found.set(key, {
            ats: pattern.ats,
            ats_slug: slug,
            url: match[0],
          });
        }
      }
    }
  }

  return [...found.values()];
}

async function main() {
  const careersUrl = process.argv[2];
  if (!careersUrl) {
    console.error("Usage: npm run detect-ats -- <careers_url>");
    process.exit(1);
  }

  console.error(`Fetching ${careersUrl}…`);
  const html = await fetchText(careersUrl);
  const detections = detectAtsFromHtml(html, careersUrl);

  if (detections.length === 0) {
    console.log(JSON.stringify({ found: false, detections: [] }, null, 2));
    process.exit(2);
  }

  console.log(JSON.stringify({ found: true, detections }, null, 2));
}

const isDirect =
  process.argv[1]?.includes("detect-ats") ||
  process.argv[1]?.endsWith("detect-ats.ts");

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

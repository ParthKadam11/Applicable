import { pathToFileURL } from "node:url";
import { extractAtsUrls } from "../discover/ats-urls.js";
import { fetchText } from "../utils/http.js";
import type { Ats } from "../ats/types.js";

interface Detection {
  ats: Ats;
  ats_slug: string;
  url: string;
}

/** Detect Ashby / Greenhouse / Lever boards from HTML or a page URL. */
export function detectAtsFromHtml(html: string, pageUrl?: string): Detection[] {
  const found = new Map<string, Detection>();

  const sources = [html];
  if (pageUrl) sources.push(pageUrl);

  for (const source of sources) {
    for (const hit of extractAtsUrls(source)) {
      const key = `${hit.ats}:${hit.atsSlug.toLowerCase()}`;
      if (!found.has(key)) {
        found.set(key, {
          ats: hit.ats,
          ats_slug: hit.atsSlug,
          url: hit.url,
        });
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
  console.log(JSON.stringify(detections, null, 2));
}

const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

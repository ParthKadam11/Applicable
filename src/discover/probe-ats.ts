import { HttpError, fetchJson } from "../utils/http.js";
import type { Ats } from "../ats/types.js";
import { slugGuesses } from "./slug-guess.js";
import type { AtsHit } from "./types.js";

async function countAshby(slug: string): Promise<number | null> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
  try {
    const data = await fetchJson<{ jobs?: unknown[] }>(url);
    return Array.isArray(data?.jobs) ? data.jobs.length : 0;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 400)) {
      return null;
    }
    throw err;
  }
}

async function countGreenhouse(slug: string): Promise<number | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
  try {
    const data = await fetchJson<{ jobs?: unknown[] }>(url);
    return Array.isArray(data?.jobs) ? data.jobs.length : 0;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

async function countLever(slug: string): Promise<number | null> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  try {
    const data = await fetchJson<unknown[]>(url);
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

export async function countOpenJobs(
  ats: Ats,
  slug: string,
): Promise<number | null> {
  if (ats === "ashby") return countAshby(slug);
  if (ats === "greenhouse") return countGreenhouse(slug);
  if (ats === "lever") return countLever(slug);
  return null;
}

const PROBE_ORDER: Ats[] = ["ashby", "greenhouse", "lever"];

/**
 * Try slug guesses from name/domain against Ashby/GH/Lever public boards.
 * Returns first hit with a live board (job count may be 0).
 */
export async function detectAtsByGuess(
  name: string,
  domain?: string | null,
): Promise<(AtsHit & { jobCount: number }) | null> {
  const guesses = slugGuesses(name, domain).slice(0, 3);
  for (const slug of guesses) {
    for (const ats of PROBE_ORDER) {
      try {
        const n = await countOpenJobs(ats, slug);
        if (n == null) continue;
        const url =
          ats === "ashby"
            ? `https://jobs.ashbyhq.com/${slug}`
            : ats === "greenhouse"
              ? `https://boards.greenhouse.io/${slug}`
              : `https://jobs.lever.co/${slug}`;
        return { ats, atsSlug: slug, url, jobCount: n };
      } catch (err) {
        // Transient errors — skip this pair, keep going.
        console.warn(
          `[discover:probe] ${ats}/${slug}:`,
          err instanceof Error ? err.message.slice(0, 120) : err,
        );
      }
    }
  }
  return null;
}

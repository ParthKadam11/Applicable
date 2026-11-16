import { fetchText } from "../../utils/http.js";
import { extractAtsUrls } from "../ats-urls.js";
import type { DiscoveredCompany } from "../types.js";

const NEW_GRAD_README =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md";
const INTERN_README =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/README.md";

function companiesFromReadme(
  markdown: string,
  evidenceBase: string,
): DiscoveredCompany[] {
  const hits = extractAtsUrls(markdown);
  const byKey = new Map<string, DiscoveredCompany>();
  for (const hit of hits) {
    const key = `${hit.ats}:${hit.atsSlug}`.toLowerCase();
    if (byKey.has(key)) continue;
    byKey.set(key, {
      name: hit.atsSlug,
      domain: null,
      source: "simplify_jobs",
      evidenceUrl: hit.url || evidenceBase,
      ats: hit.ats,
      atsSlug: hit.atsSlug,
      earlyCareer: true,
      priorityGeo: true,
    });
  }
  return [...byKey.values()];
}

/** Parse SimplifyJobs GitHub READMEs for public ATS board URLs. */
export async function discoverSimplifyJobs(): Promise<DiscoveredCompany[]> {
  const out: DiscoveredCompany[] = [];
  try {
    const ng = await fetchText(NEW_GRAD_README);
    out.push(...companiesFromReadme(ng, NEW_GRAD_README));
  } catch (err) {
    console.warn(
      "[discover:simplify_jobs] new-grad failed:",
      err instanceof Error ? err.message.slice(0, 120) : err,
    );
  }
  try {
    const intern = await fetchText(INTERN_README);
    out.push(...companiesFromReadme(intern, INTERN_README));
  } catch (err) {
    console.warn(
      "[discover:simplify_jobs] intern failed:",
      err instanceof Error ? err.message.slice(0, 120) : err,
    );
  }

  const byKey = new Map<string, DiscoveredCompany>();
  for (const c of out) {
    const key =
      c.ats && c.atsSlug
        ? `${c.ats}:${c.atsSlug}`.toLowerCase()
        : c.name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const rows = [...byKey.values()];
  console.log(`[discover:simplify_jobs] ATS boards from READMEs: ${rows.length}`);
  return rows;
}

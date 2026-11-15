import { getAdapter, listSmartRecruitersTitles } from "../ats/index.js";
import type { Ats } from "../ats/types.js";

/** Fetch open job titles from a public ATS board (for tech-ratio checks). */
export async function fetchBoardJobTitles(
  ats: Ats,
  slug: string,
): Promise<string[]> {
  try {
    if (ats === "smartrecruiters") {
      return await listSmartRecruitersTitles(slug);
    }
    const adapter = getAdapter(ats);
    // companyId is unused by adapters for HTTP fetch
    const jobs = await adapter.fetchJobs(
      slug,
      "00000000-0000-0000-0000-000000000000",
    );
    return jobs.map((j) => j.title).filter(Boolean);
  } catch {
    return [];
  }
}

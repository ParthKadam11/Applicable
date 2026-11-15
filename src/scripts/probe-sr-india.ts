import { listSmartRecruitersTitles } from "../ats/smartrecruiters.js";
import { evaluateIndustryFilter } from "../discover/industry-filter.js";

async function main() {
  for (const [name, slug] of [
    ["Swiggy", "swiggy"],
    ["Freshworks", "freshworks"],
    ["Unacademy", "unacademy"],
    ["NoBroker", "nobroker"],
  ] as const) {
    const titles = await listSmartRecruitersTitles(slug);
    const r = evaluateIndustryFilter({ name, atsSlug: slug, jobTitles: titles });
    console.log(name, "titles", titles.length, r);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

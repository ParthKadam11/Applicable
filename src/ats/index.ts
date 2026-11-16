import { ashbyAdapter } from "./ashby.js";
import { greenhouseAdapter } from "./greenhouse.js";
import { leverAdapter } from "./lever.js";
import { smartRecruitersAdapter } from "./smartrecruiters.js";
import { workableAdapter } from "./workable.js";
import type { Ats, AtsAdapter } from "./types.js";

const adapters: Partial<Record<Ats, AtsAdapter>> = {
  ashby: ashbyAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  smartrecruiters: smartRecruitersAdapter,
  workable: workableAdapter,
};

export function getAdapter(ats: Ats): AtsAdapter {
  const adapter = adapters[ats];
  if (!adapter) {
    throw new Error(`ATS adapter not implemented yet: ${ats}`);
  }
  return adapter;
}

export * from "./types.js";
export { ashbyAdapter, normalizeAshbyJob } from "./ashby.js";
export { greenhouseAdapter, normalizeGreenhouseJob } from "./greenhouse.js";
export { leverAdapter, normalizeLeverJob } from "./lever.js";
export {
  smartRecruitersAdapter,
  normalizeSmartRecruitersJob,
  listSmartRecruitersTitles,
  countSmartRecruitersJobs,
} from "./smartrecruiters.js";
export {
  workableAdapter,
  normalizeWorkableJob,
  countWorkableJobs,
} from "./workable.js";

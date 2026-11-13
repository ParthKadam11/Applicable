import type { JobRow } from "@/lib/api";

const SENIOR_RE =
  /\b(senior|staff|principal|lead|director|manager|head of|sr\.?|ii+|iii)\b/i;
const ENTRY_RE =
  /\b(junior|jr\.?|intern|internship|new grad|graduate|entry[- ]?level|associate|apprentice|trainee|early career|university|campus)\b/i;

export function isEntryLevelJob(job: JobRow): boolean {
  if (SENIOR_RE.test(job.title)) return false;
  return ENTRY_RE.test(job.title);
}

export function filterEntryLevelJobs(jobs: JobRow[]): JobRow[] {
  return jobs.filter(isEntryLevelJob);
}

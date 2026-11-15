import type { Metadata } from "next";
import Link from "next/link";
import {
  ELIGIBILITY_COLORS,
  ELIGIBILITY_LABELS,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: "Labels explained",
  description:
    "What Applicable’s India-eligibility labels mean: open, remote from India, India onsite, region-locked, and unclear.",
};

const LABELS = [
  {
    id: "open",
    key: "open",
    title: "Open",
    short: ELIGIBILITY_LABELS.open,
    body: "The posting is open worldwide or does not restrict applicants by country. India-based candidates can apply.",
  },
  {
    id: "india-remote",
    key: "india_remote",
    title: "Remote from India",
    short: ELIGIBILITY_LABELS.india_remote,
    body: "The role is remote and explicitly allows hiring from India (or lists India among eligible locations).",
  },
  {
    id: "india-onsite",
    key: "india_onsite",
    title: "India onsite",
    short: ELIGIBILITY_LABELS.india_onsite,
    body: "The job is based in India (office / hybrid / onsite). Not a remote-from-India role.",
  },
  {
    id: "region-locked",
    key: "region_locked",
    title: "Region-locked",
    short: ELIGIBILITY_LABELS.region_locked,
    body: "The posting limits applicants to regions that exclude India (for example US-only or EMEA-only).",
  },
  {
    id: "unclear",
    key: "unclear",
    title: "Unclear",
    short: ELIGIBILITY_LABELS.unclear,
    body: "Location or eligibility language is missing or ambiguous. We surface the quote so you can judge.",
  },
] as const;

export default function LabelsPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-8 sm:pt-14">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mark-deep">
          Resources
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
          Labels explained
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-mute">
          Every tech role in Applicable gets an India-eligibility label, with the
          line from the posting that supports it.
        </p>

        <ol className="mt-10 space-y-8 border-t border-line pt-10">
          {LABELS.map((label) => (
            <li
              key={label.id}
              id={label.id}
              className="scroll-mt-24"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: ELIGIBILITY_COLORS[label.key] }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <h2 className="font-display text-xl text-ink sm:text-[1.35rem]">
                    {label.title}
                  </h2>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-mute">
                    {label.short}
                  </p>
                  <p className="mt-2 text-pretty text-[14px] leading-relaxed text-mute">
                    {label.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-[13px] text-mute">
          <Link href="/#how" className="text-mark-deep hover:underline">
            How Applicable works
          </Link>
          {" · "}
          <Link href="/dashboard/jobs" className="text-mark-deep hover:underline">
            Browse jobs
          </Link>
        </p>
      </main>
    </div>
  );
}

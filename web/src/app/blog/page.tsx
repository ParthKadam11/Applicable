import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes from Applicable on India-eligible remote hiring, ATS coverage, and agent workflows.",
};

export default function BlogPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-8 sm:pt-14">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mark-deep">
          Resources
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
          Blog
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-mute">
          Writing is on the way. Meanwhile, explore live jobs or join early
          access.
        </p>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-10 sm:flex-row sm:items-center sm:gap-4">
          <Link href="/dashboard/jobs" className="btn-ink touch-manipulation">
            Browse jobs
          </Link>
          <a
            href={LINKS.earlyAccess}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost touch-manipulation sm:w-auto"
          >
            Get early access
          </a>
        </div>
      </main>
    </div>
  );
}

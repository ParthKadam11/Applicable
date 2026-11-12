import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LINKS } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-9 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 font-display text-xl text-ink"
          >
            <BrandLogo size={28} className="rounded-[7px]" />
            Applicable
          </Link>
          <p className="mt-1 font-mono text-[11px] uppercase text-mute">
            Built by{" "}
            <a
              href={LINKS.portfolio}
              className="text-mark-deep underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Parth Kadam
            </a>
          </p>
        </div>
        <div className="flex gap-5 font-mono text-[11px] uppercase text-mute">
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="hover:text-ink">
            GitHub
          </a>
          <a href={LINKS.x} target="_blank" rel="noreferrer" className="hover:text-ink">
            X
          </a>
          <a
            href={LINKS.portfolio}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink"
          >
            Portfolio
          </a>
        </div>
      </div>
    </footer>
  );
}

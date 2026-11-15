import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { fetchStats } from "@/lib/api";
import { LINKS } from "@/lib/constants";
import {
  FOOTER_AGENTS,
  FOOTER_ATS_LINE,
  FOOTER_PRODUCT,
  FOOTER_TAGLINE,
  footerConnect,
  footerResources,
  formatLastUpdatedAgo,
  type FooterLink,
} from "@/lib/footer";

function FooterNavLink({ link }: { link: FooterLink }) {
  const className =
    "text-[13px] leading-snug text-mute transition hover:text-ink focus-visible:text-ink";

  if (link.external) {
    return (
      <a
        href={link.href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
      >
        {link.label}
      </a>
    );
  }

  if (link.href.startsWith("mailto:")) {
    return (
      <a href={link.href} className={className}>
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink">
        {title}
      </h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <FooterNavLink link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Product footer shared across marketing + app pages (root layout). */
export async function SiteFooter() {
  const stats = await fetchStats();
  const updated = formatLastUpdatedAgo(stats?.last_ingestion_at);
  const resources = footerResources();
  const connect = footerConnect();
  const year = 2026;

  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-12 sm:px-8 sm:pb-10 sm:pt-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
          <div className="max-w-sm shrink-0">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 font-display text-xl text-ink"
            >
              <BrandLogo size={28} className="rounded-[7px]" />
              Applicable
            </Link>
            <p className="mt-3 max-w-[18rem] text-pretty text-[13px] leading-relaxed text-mute">
              {FOOTER_TAGLINE}
            </p>
            <a
              href={LINKS.earlyAccess}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-[13px] font-medium text-mark-deep underline-offset-2 hover:underline"
            >
              Get early access
            </a>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            <FooterColumn title="Product" links={FOOTER_PRODUCT} />
            <FooterColumn title="For agents" links={FOOTER_AGENTS} />
            <FooterColumn title="Resources" links={resources} />
            <FooterColumn title="Connect" links={connect} />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-[11px] leading-relaxed text-mute sm:mt-14 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
            <span>{FOOTER_ATS_LINE}</span>
            <span className="hidden text-line sm:inline" aria-hidden>
              ·
            </span>
            <span>
              Graph powered by{" "}
              <a
                href={LINKS.hydradb}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-ink hover:underline"
              >
                HydraDB
              </a>
            </span>
            {updated ? (
              <>
                <span className="hidden text-line sm:inline" aria-hidden>
                  ·
                </span>
                <span>{updated}</span>
              </>
            ) : null}
            <span className="hidden text-line sm:inline" aria-hidden>
              ·
            </span>
            <span>© {year} Applicable</span>
          </div>
          <a
            href={LINKS.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] text-mute/80 underline-offset-2 hover:text-mute hover:underline sm:text-right"
          >
            Made by Parth
          </a>
        </div>
      </div>
    </footer>
  );
}

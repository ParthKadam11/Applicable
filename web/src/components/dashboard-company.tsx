"use client";

import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { DashboardJobs } from "@/components/dashboard-jobs";
import type { ApiCompanyDetail } from "@/lib/companies-api";
import type { ApiJob } from "@/lib/jobs-api";

type JobsInitial = {
  items: ApiJob[];
  nextCursor: string | null;
  total: number;
  lastIngestionAt: string | null;
};

export function DashboardCompany({
  company,
  jobsInitial,
}: {
  company: ApiCompanyDetail;
  jobsInitial: JobsInitial | null;
}) {
  const counts = company.counts;
  const openN = counts.open + counts.india_remote;

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3">
          <Link
            href="/dashboard/companies"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-mark-deep"
          >
            ← Companies
          </Link>
        </p>
        <header className="flex items-start gap-3.5 sm:gap-4">
          <CompanyLogo
            company={company.name}
            website={company.website}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
              {company.name}
            </h1>
            <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
              {company.ats ? (
                <span className="uppercase tracking-[0.04em]">{company.ats}</span>
              ) : null}
              {company.source ? (
                <>
                  {company.ats ? (
                    <span className="mx-1.5 text-line">·</span>
                  ) : null}
                  via {company.source}
                </>
              ) : null}
              <span className="mx-1.5 text-line">·</span>
              {openN} open / India-remote
              <span className="mx-1.5 text-line">·</span>
              {company.activeJobs} active
            </p>
            <p className="mt-1 text-[12px] text-mute/90">
              open {counts.open}
              <span className="mx-1.5 text-line">·</span>
              india_remote {counts.india_remote}
              <span className="mx-1.5 text-line">·</span>
              india_onsite {counts.india_onsite}
              <span className="mx-1.5 text-line">·</span>
              region_locked {counts.region_locked}
              <span className="mx-1.5 text-line">·</span>
              unclear {counts.unclear}
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              {company.atsBoardUrl ? (
                <a
                  href={company.atsBoardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
                >
                  ATS board
                </a>
              ) : null}
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
                >
                  Website
                </a>
              ) : null}
            </div>
          </div>
        </header>
      </div>

      <DashboardJobs
        initial={jobsInitial}
        companySlug={company.slug}
        basePath={`/dashboard/companies/${company.slug}`}
        hideChrome
      />
    </div>
  );
}

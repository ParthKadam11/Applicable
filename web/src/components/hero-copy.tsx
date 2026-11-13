import Link from "next/link";
import { BrowseJobsLink } from "@/components/browse-jobs-link";

/**
 * Stacked hero: calm frosted pocket + editorial type + CTAs + preview.
 */
export function HeroCopy() {
  return (
    <div className="relative z-[1] w-full">
      <div className="mx-auto max-w-5xl px-4 pt-12 xs:px-5 sm:px-8 sm:pt-16 md:pt-20 lg:pt-24">
        <div className="relative mx-auto flex w-full max-w-[20rem] flex-col items-center text-center xs:max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-[46rem]">
          <div className="hero-readability" aria-hidden />

          <div className="relative px-2 sm:px-4">
            <h1 className="hero-title font-hero text-ink">
              <span className="hero-title-line hero-title-line--lead">
                Remote jobs that
              </span>
              <span className="hero-title-line hero-title-line--punch">
                actually hire from India.
              </span>
            </h1>

            <p className="hero-sub mx-auto mt-5 max-w-[16rem] text-mute xs:max-w-[18rem] sm:mt-6 sm:max-w-sm md:mt-7">
              With proof from every posting.
            </p>

            <div className="hero-ctas mt-8 flex w-full max-w-xs flex-col items-stretch gap-2.5 xs:max-w-sm sm:mt-10 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-3">
              <BrowseJobsLink className="btn-ink min-h-11 w-full touch-manipulation sm:w-auto sm:min-w-[10.5rem]" />
              <Link
                href="/#mcp"
                className="btn-ghost min-h-11 w-full touch-manipulation sm:w-auto sm:min-w-[10.5rem]"
              >
                Add to your AI
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-preview-wrap mx-auto mt-8 w-full px-4 xs:px-5 sm:mt-12 sm:max-w-4xl sm:px-8 md:mt-14 lg:mt-16 lg:max-w-5xl">
        <div
          className="hero-preview relative w-full overflow-hidden rounded-t-xl border border-b-0 border-line bg-white/55 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--ink)_22%,transparent)] sm:rounded-t-2xl"
          data-slot="hero-dashboard"
          aria-hidden
        >
          <div className="hero-preview-frame absolute inset-x-0 top-0 w-full">
            <div className="absolute inset-0 hero-iso opacity-40" />
            <div className="absolute inset-0 flex items-start justify-center pt-[16%] sm:pt-[18%]">
              <span className="text-[10px] uppercase tracking-[0.18em] text-mute/70 sm:text-[11px]">
                Dashboard
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

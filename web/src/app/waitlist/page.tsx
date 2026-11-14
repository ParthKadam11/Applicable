import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { WaitlistForm } from "@/components/waitlist-form";

export const metadata: Metadata = {
  title: "Waitlist",
  description:
    "Join the Applicable waitlist — remote jobs that actually hire from India, with proof.",
  robots: { index: true, follow: true },
};

/**
 * Minimal waitlist — coastal Applicable system, calm spacing.
 */
export default function WaitlistPage() {
  return (
    <main className="sky relative flex min-h-dvh flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_22%,rgba(255,255,255,0.7)_0%,rgba(246,250,252,0.22)_48%,transparent_72%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-28 top-16 size-[30rem] rounded-full bg-[color-mix(in_srgb,var(--mark)_16%,transparent)] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 size-[24rem] rounded-full bg-[color-mix(in_srgb,var(--sun)_12%,transparent)] blur-3xl"
        aria-hidden
      />

      <div className="relative z-[1] mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-16 sm:px-8 sm:py-24">
        <div className="waitlist-in relative flex w-full max-w-md flex-col items-center text-center">
          <div className="hero-readability" aria-hidden />

          <div className="relative flex items-center gap-2.5 sm:gap-3">
            <BrandLogo
              size={32}
              className="rounded-[8px] shadow-[0_10px_28px_-14px_color-mix(in_srgb,var(--mark-deep)_50%,transparent)] sm:rounded-[9px]"
            />
            <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-ink sm:text-[17px]">
              Applicable
            </p>
          </div>

          <h1 className="font-hero relative mt-12 text-[1.75rem] font-medium italic leading-[1.15] tracking-[-0.035em] text-ink sm:mt-14 sm:text-[2.15rem]">
            Get early access
          </h1>

          <p className="relative mx-auto mt-5 max-w-[17rem] text-[14px] font-medium leading-relaxed tracking-[-0.01em] text-mute sm:mt-6 sm:max-w-xs sm:text-[15px]">
            Stop applying to &lsquo;remote&rsquo; jobs that aren&rsquo;t open to
            India.
          </p>

          <div className="relative mt-12 w-full sm:mt-14">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </main>
  );
}

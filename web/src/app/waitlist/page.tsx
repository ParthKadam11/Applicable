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
 * Minimal waitlist — Applicable coastal system, brand-first, one job.
 */
export default function WaitlistPage() {
  return (
    <main className="sky relative flex min-h-dvh flex-col overflow-hidden">
      {/* Soft coastal atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_18%,rgba(255,255,255,0.72)_0%,rgba(246,250,252,0.25)_48%,transparent_72%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 top-24 size-[28rem] rounded-full bg-[color-mix(in_srgb,var(--mark)_18%,transparent)] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-10 size-[22rem] rounded-full bg-[color-mix(in_srgb,var(--sun)_14%,transparent)] blur-3xl"
        aria-hidden
      />

      <div className="relative z-[1] mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-5 py-16 text-center sm:px-8 sm:py-20">
        <div className="waitlist-in flex flex-col items-center">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <BrandLogo
              size={40}
              className="rounded-[10px] shadow-[0_10px_28px_-12px_color-mix(in_srgb,var(--mark-deep)_45%,transparent)] sm:rounded-[12px]"
            />
            <p className="font-display text-[1.35rem] font-semibold tracking-tight text-ink sm:text-[1.5rem]">
              Applicable
            </p>
          </div>

          <h1 className="font-hero mt-8 max-w-[18rem] text-[1.85rem] leading-[1.15] tracking-[-0.02em] text-ink xs:max-w-[20rem] sm:mt-9 sm:max-w-md sm:text-[2.35rem]">
            Get early access
          </h1>

          <p className="mt-4 max-w-[18rem] text-[14px] leading-relaxed text-mute sm:mt-5 sm:max-w-sm sm:text-[15px]">
            Remote jobs that actually hire from India — with proof from every
            posting. We’re opening soon.
          </p>

          <div className="mt-8 w-full max-w-sm sm:mt-10">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { BrandLogo } from "@/components/brand-logo";

export function AuthSignIn() {
  return (
    <div className="flex h-full min-h-[100dvh] flex-col items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-[22rem] flex-col items-center text-center">
        <Link href="/" className="inline-flex flex-col items-center gap-3">
          <BrandLogo size={44} className="rounded-[10px]" />
          <span className="font-display text-xl tracking-tight text-ink">
            Applicable
          </span>
        </Link>

        <p className="mt-8 font-hero text-2xl font-medium tracking-[-0.02em] text-ink sm:text-[1.75rem]">
          Know before you apply
        </p>

        <button
          type="button"
          onClick={() =>
            void signIn("google", {
              callbackUrl: "/dashboard/jobs",
              redirect: true,
            })
          }
          className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-5 text-[13px] font-semibold text-ink shadow-[0_8px_24px_-16px_color-mix(in_srgb,var(--ink)_40%,transparent)] transition hover:border-mark hover:bg-mark-soft"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <p className="mt-6 text-[12px] text-mute">
          <Link
            href="/"
            className="underline-offset-2 hover:text-ink hover:underline"
          >
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.3 3 3 12.3 3 24s9.3 21 21 21 21-9.3 21-21c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.3 26.7 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 40.6 16.2 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.0.0 6.2 5.2C39.2 36.3 45 31 45 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

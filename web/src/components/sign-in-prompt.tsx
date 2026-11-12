"use client";

import { signIn } from "next-auth/react";

type Props = {
  open: boolean;
  message?: string;
  onClose: () => void;
};

export function SignInPrompt({
  open,
  message = "Sign in to save this job",
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/30 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="signin-title" className="font-display text-xl text-ink">
          {message}
        </h2>
        <p className="mt-2 text-sm text-mute">
          Google only. Public browse stays free without an account.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void signIn("google")}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-mark px-4 text-[11px] font-semibold uppercase tracking-wide text-ink transition hover:bg-mark-deep hover:text-white"
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-line px-4 text-[11px] uppercase tracking-wide text-mute"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

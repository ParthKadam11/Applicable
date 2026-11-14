"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "ok" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setStatus("error");
      setMessage("Enter a valid email.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        already?: boolean;
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
        return;
      }
      setStatus("ok");
      setMessage(
        data.already
          ? "You're already on the list."
          : "You're on the list. We'll be in touch.",
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  if (status === "ok") {
    return (
      <div className="px-1 text-center" role="status">
        <p className="font-display text-[15px] font-semibold tracking-tight text-ink">
          {message}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">
          Watch your inbox — no spam, just the invite.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <label htmlFor="waitlist-email" className="sr-only">
        Email
      </label>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-2.5">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setMessage(null);
            }
          }}
          placeholder="you@email.com"
          disabled={status === "loading"}
          className="min-h-12 w-full flex-1 rounded-full border border-line bg-paper-2/95 px-5 text-[15px] tracking-[-0.01em] text-ink shadow-[0_8px_24px_-18px_color-mix(in_srgb,var(--ink)_28%,transparent)] outline-none placeholder:text-mute/65 transition focus:border-mark focus:ring-2 focus:ring-mark/25 disabled:opacity-60"
        />
        <div className="flex w-full flex-col sm:w-auto sm:items-end">
          <button
            type="submit"
            disabled={status === "loading"}
            className="btn-ink min-h-12 w-full shrink-0 touch-manipulation px-6 sm:w-auto sm:min-w-[11rem]"
          >
            {status === "loading" ? "Joining…" : "Join waitlist"}
          </button>
          {message && status === "error" ? (
            <p
              className="mt-2 text-center text-[11px] tracking-wide text-danger sm:pr-1 sm:text-right"
              role="alert"
            >
              {message}
            </p>
          ) : (
            <p className="mt-2 text-center text-[11px] tracking-wide text-mute sm:pr-1 sm:text-right">
              No spam. Unsubscribe anytime.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

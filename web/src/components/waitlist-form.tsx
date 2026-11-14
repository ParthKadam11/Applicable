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
          ? "You’re already on the list."
          : "You’re on the list. We’ll be in touch.",
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  if (status === "ok") {
    return (
      <div
        className="rounded-2xl border border-line bg-paper-2/90 px-5 py-5 text-left shadow-[0_16px_40px_-28px_color-mix(in_srgb,var(--ink)_18%,transparent)]"
        role="status"
      >
        <p className="text-[14px] font-medium text-ink">{message}</p>
        <p className="mt-1.5 text-[13px] text-mute">
          Watch your inbox — no spam, just the invite.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full text-left" noValidate>
      <label htmlFor="waitlist-email" className="sr-only">
        Email
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-2">
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
          className="min-h-11 w-full flex-1 rounded-full border border-line bg-paper-2 px-4 text-[14px] text-ink outline-none placeholder:text-mute/70 transition focus:border-mark focus:ring-2 focus:ring-mark/25 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-ink min-h-11 shrink-0 touch-manipulation sm:min-w-[9.5rem]"
        >
          {status === "loading" ? "Joining…" : "Join waitlist"}
        </button>
      </div>
      {message && status === "error" ? (
        <p className="mt-2.5 px-1 text-[12px] text-danger" role="alert">
          {message}
        </p>
      ) : (
        <p className="mt-2.5 px-1 text-[12px] text-mute">
          No spam. Unsubscribe anytime.
        </p>
      )}
    </form>
  );
}

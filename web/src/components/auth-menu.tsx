"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

export function AuthMenu() {
  const { data, status } = useSession();

  if (status === "loading") {
    return (
      <span className="hidden rounded-full px-2.5 py-1.5 text-mute sm:inline">
        …
      </span>
    );
  }

  if (!data?.user) {
    return (
      <button
        type="button"
        onClick={() => void signIn("google")}
        className="rounded-full px-2.5 py-1.5 text-mute transition hover:bg-white/45 hover:text-ink sm:px-3"
      >
        Sign in
      </button>
    );
  }

  return (
    <span className="flex items-center gap-0.5 sm:gap-1.5">
      <Link
        href="/me"
        className="rounded-full px-2.5 py-1.5 text-mute transition hover:bg-white/45 hover:text-ink sm:px-3"
      >
        Me
      </Link>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="rounded-full px-2.5 py-1.5 text-mute transition hover:bg-white/45 hover:text-ink sm:px-3"
      >
        Sign out
      </button>
    </span>
  );
}

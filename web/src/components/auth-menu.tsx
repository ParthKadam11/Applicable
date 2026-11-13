"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Skel } from "@/components/ui/skeleton";

export function AuthMenu() {
  const { data, status } = useSession();

  if (status === "loading") {
    return (
      <span
        className="inline-flex items-center px-2.5 py-1.5 sm:px-3"
        aria-hidden
      >
        <Skel className="h-3 w-12 rounded-full sm:w-14" />
      </span>
    );
  }

  if (!data?.user) {
    return (
      <Link
        href="/auth"
        className="rounded-full px-2.5 py-1.5 text-mute transition hover:bg-white/45 hover:text-ink sm:px-3"
      >
        Sign in
      </Link>
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

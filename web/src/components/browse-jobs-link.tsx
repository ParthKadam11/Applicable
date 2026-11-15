"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { authHref } from "@/lib/nav";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/** Browse jobs → dashboard when signed in, auth (with return) when not. */
export function BrowseJobsLink({ className, children = "Browse jobs" }: Props) {
  const { data, status } = useSession();
  const href =
    status === "authenticated" && data?.user
      ? "/dashboard/jobs"
      : authHref("/dashboard/jobs");

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

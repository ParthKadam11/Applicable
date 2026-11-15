"use client";

import { usePathname } from "next/navigation";

/** Marketing header/footer — hidden on app, auth, and waitlist surfaces. */
export function hideSiteChrome(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/waitlist")
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (hideSiteChrome(pathname)) return null;
  return <>{children}</>;
}

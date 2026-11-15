import { GITHUB_PUBLIC, LINKS } from "./constants";

export type NavUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function authHref(callbackPath: string): string {
  return `/auth?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

export function showGitHubNav(): boolean {
  return GITHUB_PUBLIC;
}

export const GITHUB_NAV_HREF = LINKS.github;

export function userInitials(user: NavUser | null | undefined): string {
  const name = user?.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user?.email?.trim();
  if (email) return email.slice(0, 2).toUpperCase();
  return "A";
}

import { auth } from "@/auth";
import { SiteNav } from "@/components/site-nav";
import type { NavUser } from "@/lib/nav";
import type { Session } from "next-auth";

type Props = {
  /** When provided by root layout, skips a second auth() round-trip. */
  session?: Session | null;
};

/** Server-backed header: session for no-flicker auth chrome. */
export async function SiteHeader({ session: sessionProp }: Props = {}) {
  const session = sessionProp === undefined ? await auth() : sessionProp;
  const user = session?.user
    ? ({
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      } satisfies NavUser)
    : null;

  return <SiteNav initialUser={user} initialSavedCount={null} />;
}

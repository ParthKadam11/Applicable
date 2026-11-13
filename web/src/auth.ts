import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertGoogleUser } from "@/lib/me";

async function syncGoogleUser(input: {
  googleSub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}) {
  try {
    return await upsertGoogleUser(input);
  } catch (err) {
    console.error(
      "[auth] upsert failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/auth",
    error: "/auth",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Always prefer dashboard after a successful OAuth round-trip
      // unless a same-origin relative/absolute callback was provided.
      if (url.startsWith("/")) {
        if (url.startsWith("/auth")) return `${baseUrl}/dashboard`;
        return `${baseUrl}${url}`;
      }
      try {
        const target = new URL(url);
        if (target.origin === baseUrl) {
          if (target.pathname.startsWith("/auth")) {
            return `${baseUrl}/dashboard`;
          }
          return url;
        }
      } catch {
        /* ignore */
      }
      return `${baseUrl}/dashboard`;
    },
    async signIn({ account, profile }) {
      // Never block Google on DB outages — that surfaces as Access Denied.
      if (account?.provider !== "google" || !profile) return false;
      const googleSub =
        typeof profile.sub === "string"
          ? profile.sub
          : typeof account.providerAccountId === "string"
            ? account.providerAccountId
            : null;
      const email = typeof profile.email === "string" ? profile.email : null;
      if (!googleSub || !email) return false;

      // Best-effort profile sync; failure must not deny sign-in.
      await syncGoogleUser({
        googleSub,
        email,
        name: typeof profile.name === "string" ? profile.name : null,
        avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
      });
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.sub) {
        token.googleSub = profile.sub;
        const email =
          typeof profile.email === "string"
            ? profile.email
            : typeof token.email === "string"
              ? token.email
              : null;
        if (email) {
          const user = await syncGoogleUser({
            googleSub: profile.sub,
            email,
            name: typeof profile.name === "string" ? profile.name : null,
            avatarUrl:
              typeof profile.picture === "string" ? profile.picture : null,
          });
          if (user?.id) token.userId = user.id;
        }
        return token;
      }

      // Retry linking DB user on later requests if the first upsert failed.
      if (
        !token.userId &&
        typeof token.googleSub === "string" &&
        typeof token.email === "string"
      ) {
        const user = await syncGoogleUser({
          googleSub: token.googleSub,
          email: token.email,
          name: typeof token.name === "string" ? token.name : null,
          avatarUrl: typeof token.picture === "string" ? token.picture : null,
        });
        if (user?.id) token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  trustHost: true,
});

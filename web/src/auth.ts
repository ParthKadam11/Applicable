import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertGoogleUser } from "@/lib/me";

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
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || !profile) return false;
      const googleSub =
        typeof profile.sub === "string"
          ? profile.sub
          : typeof account.providerAccountId === "string"
            ? account.providerAccountId
            : null;
      const email = typeof profile.email === "string" ? profile.email : null;
      if (!googleSub || !email) return false;

      try {
        await upsertGoogleUser({
          googleSub,
          email,
          name: typeof profile.name === "string" ? profile.name : null,
          avatarUrl:
            typeof profile.picture === "string" ? profile.picture : null,
        });
        return true;
      } catch (err) {
        console.error(
          "[auth] upsert failed:",
          err instanceof Error ? err.message : err,
        );
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.sub) {
        try {
          const email =
            typeof profile.email === "string"
              ? profile.email
              : typeof token.email === "string"
                ? token.email
                : null;
          if (!email) return token;
          const user = await upsertGoogleUser({
            googleSub: profile.sub,
            email,
            name: typeof profile.name === "string" ? profile.name : null,
            avatarUrl:
              typeof profile.picture === "string" ? profile.picture : null,
          });
          token.userId = user.id;
        } catch (err) {
          console.error(
            "[auth] jwt upsert failed:",
            err instanceof Error ? err.message : err,
          );
        }
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

import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { FontLoader } from "@/components/font-loader";
import { AppSessionProvider } from "@/components/session-provider";
import { SiteChrome } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hero",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Applicable: Can I apply from India?",
    template: "%s · Applicable",
  },
  description:
    "Every live remote tech job, checked for whether you can actually apply from India, with the line from the posting that proves it.",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo.svg" }],
  },
  openGraph: {
    title: "Applicable — Can I apply from India?",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
    url: SITE_URL,
    siteName: "Applicable",
    type: "website",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Applicable — Can I apply from India?",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Applicable — Can I apply from India?",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6fafc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const host = (
    h.get("x-forwarded-host") ||
    h.get("host") ||
    ""
  ).toLowerCase();
  // Waitlist subdomain must not mount next-auth — AUTH_URL is the main site
  // and a failed /api/auth/session can crash SessionProvider on the client.
  const isWaitlistHost =
    h.get("x-joinwaitlist") === "1" || host.startsWith("joinwaitlist.");

  const session = isWaitlistHost ? null : await auth();

  return (
    <html lang="en" className={`${fraunces.variable} font-sans`}>
      <head>
        <link rel="preconnect" href="https://fonts.cdnfonts.com" crossOrigin="" />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.cdnfonts.com/css/morrison"
          />
        </noscript>
      </head>
      <body className="antialiased">
        <FontLoader />
        {isWaitlistHost ? (
          children
        ) : (
          <AppSessionProvider session={session}>
            <SiteChrome>
              <SiteHeader session={session} />
            </SiteChrome>
            {children}
            <SiteChrome>
              <SiteFooter />
            </SiteChrome>
          </AppSessionProvider>
        )}
      </body>
    </html>
  );
}

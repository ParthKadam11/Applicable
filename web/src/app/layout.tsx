import type { Metadata, Viewport } from "next";
import { FontLoader } from "@/components/font-loader";
import { AppSessionProvider } from "@/components/session-provider";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

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
    title: "Applicable",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
    url: SITE_URL,
    siteName: "Applicable",
    type: "website",
    images: [{ url: "/logo.svg" }],
  },
  twitter: {
    card: "summary",
    title: "Applicable",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
    images: ["/logo.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f6fafc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="font-sans">
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
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}

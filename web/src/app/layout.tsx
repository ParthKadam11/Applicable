import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Applicable — Can I apply from India?",
    template: "%s · Applicable",
  },
  description:
    "Every live remote tech job, checked for whether you can actually apply from India — with the line from the posting that proves it.",
  openGraph: {
    title: "Applicable",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
    url: SITE_URL,
    siteName: "Applicable",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Applicable",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="font-sans">
      <head>
        <link
          href="https://fonts.cdnfonts.com/css/morrison"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { IBM_Plex_Mono, Geist } from "next/font/google";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CanIApply — Can I apply from India?",
    template: "%s · CanIApply",
  },
  description:
    "Every live remote tech job, checked for whether you can actually apply from India — with the line from the posting that proves it.",
  openGraph: {
    title: "CanIApply",
    description:
      "Live remote tech jobs classified for India eligibility, with quoted proof.",
    url: SITE_URL,
    siteName: "CanIApply",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CanIApply",
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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <link
          href="https://fonts.cdnfonts.com/css/morrison"
          rel="stylesheet"
        />
      </head>
      <body className={`${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}

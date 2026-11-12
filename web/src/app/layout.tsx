import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

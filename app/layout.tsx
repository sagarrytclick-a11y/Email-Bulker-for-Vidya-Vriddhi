import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Likoy Vidya Vriddhi Email Bulker — Safe bulk email sender",
    template: "%s · Likoy Vidya Vriddhi Email Bulker",
  },
  description:
    "A production-ready bulk email sender with JWT login, SMTP controls, CSV personalization, live preview, server-side throttling and real-time delivery logs.",
  applicationName: "Likoy Vidya Vriddhi Email Bulker",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "32x32" }],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-zinc-200">{children}</body>
    </html>
  );
}

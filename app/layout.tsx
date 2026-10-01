import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-vf.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "HIMS Simulation",
  description:
    "Hospital information management simulation — OPD, IPD, pharmacy, lab, beds, billing and records.",
};

/** The app ships a single light theme; keep native controls light too. */
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} ${geistMono.variable} h-full overflow-hidden`}
    >
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

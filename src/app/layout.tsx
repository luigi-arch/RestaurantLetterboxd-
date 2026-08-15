import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { TabBar } from "@/components/TabBar";
import { TopBar } from "@/components/TopBar";
import { BRAND } from "@/config/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// The closest freely available relative of Canela or Editorial New: high
// contrast, modern, and unmistakably editorial. Restaurant names are set in it.
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const SITE_TITLE = `${BRAND.name} — ${BRAND.tagline}`;

export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  openGraph: {
    title: SITE_TITLE,
    description: BRAND.description,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f14" },
  ],
  // The log sheet and tab bar assume a stable viewport.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${instrument.variable} font-sans antialiased`}
      >
        <TopBar />

        {/* Bottom padding clears the floating tab bar on mobile. */}
        <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-32 md:pb-16">
          {children}
        </main>

        <TabBar />
      </body>
    </html>
  );
}

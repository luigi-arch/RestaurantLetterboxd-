import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { BRAND } from "@/config/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// A high-contrast serif for headings: the product this replaces is a printed
// restaurant guide, and the type should remember that.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline.toLowerCase()}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline.toLowerCase()}`,
    description: BRAND.description,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${fraunces.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col">
          <SiteNav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
          <footer className="mt-12 border-t px-4 py-6">
            <div className="mx-auto flex max-w-5xl flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
              <span>
                {BRAND.name} — {BRAND.tagline.toLowerCase()}.
              </span>
              {/* ODbL requires visible attribution wherever OSM data appears. */}
              <span>
                Restaurant data ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  className="underline hover:text-muted"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenStreetMap contributors
                </a>
              </span>
              <Link href="/about" className="underline hover:text-muted">
                How ratings work
              </Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Literata } from "next/font/google";
import Link from "next/link";
import CategoryScope from "@/components/layout/CategoryScope";
import Logo from "@/components/layout/Logo";
import SearchHotkey from "@/components/layout/SearchHotkey";
import SiteFooter from "@/components/layout/SiteFooter";
import SignInButton from "@/components/layout/SignInButton";
import ThemeToggle, { themeInitScript } from "@/components/layout/ThemeToggle";
import { WorkbenchProvider } from "@/components/workbench/context";
import { categoryThemesCss } from "@/lib/category-theme-css";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
// Display serif for the "editorial" theme. Not preloaded: the browser fetches it only on pages that use it.
const literata = Literata({ subsets: ["latin"], variable: "--font-literata", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "A collection of handy tools.",
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable} ${literata.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Per-category token overrides from the registry; values are checked in categoryThemesCss. */}
        <style dangerouslySetInnerHTML={{ __html: categoryThemesCss() }} />
      </head>
      <body className="antialiased">
        <WorkbenchProvider>
          <CategoryScope>
            <header data-brand className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_85%,transparent)] backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-3">
                <Logo />
                <nav aria-label="Main" className="hidden gap-6 text-sm text-[color:var(--text-muted)] sm:flex">
                  <Link href="/tools" className="hover:text-[color:var(--text)]">
                    Tools
                  </Link>
                  <Link href="/#categories" className="hover:text-[color:var(--text)]">
                    Categories
                  </Link>
                </nav>
                <div className="ml-auto flex items-center gap-2">
                  <ThemeToggle />
                  <SignInButton />
                </div>
              </div>
            </header>
            {children}
            <SiteFooter />
          </CategoryScope>
          <SearchHotkey />
        </WorkbenchProvider>
      </body>
    </html>
  );
}

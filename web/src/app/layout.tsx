import type { Metadata } from "next";
import Link from "next/link";
import { ContentProvider } from "@/components/ContentProvider";
import JobNotifier from "@/components/JobNotifier";
import SiteHeader, { BrandMark } from "@/components/SiteHeader";
import { T } from "@/components/T";
import { themeInitScript } from "@/components/ThemeToggle";
import VerifyBanner from "@/components/VerifyBanner";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { getContent, getSettings } from "@/lib/settings";
import { getActiveSubscription, isSubscriptionBypassed } from "@/lib/subscriptions";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "Transcribe — audio and video to reviewable text",
    template: "%s — Transcribe",
  },
  description:
    "Upload audio or video, paste a media link, or record in your browser. Review timestamped speech-to-text output and export the result.",
  openGraph: {
    type: "website",
    title: "Transcribe — audio and video to reviewable text",
    description:
      "Upload audio or video, paste a media link, or record in your browser. Review timestamped speech-to-text output and export the result.",
    url: "/",
    siteName: "Transcribe",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const admin = isAdmin(user);
  const [rawSub, content, settings] = await Promise.all([
    user ? getActiveSubscription(user.id) : Promise.resolve(null),
    getContent(),
    getSettings(),
  ]);
  const sub = isSubscriptionBypassed(user, settings) ? null : rawSub;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ContentProvider value={content} isAdmin={admin}>
          <SiteHeader
            loggedIn={!!user}
            creditBalance={user?.creditBalance ?? 0}
            admin={admin}
            hasSubscription={!!sub}
          />
          {user && !user.emailVerified && (
            <VerifyBanner bonusCredits={settings.signupBonusCredits} />
          )}
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto max-w-6xl px-4 pb-24 sm:px-6"
          >
            {children}
          </main>
          {user && <JobNotifier />}
          <footer className="border-t border-line">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-muted sm:px-6 md:grid-cols-[minmax(14rem,1fr)_minmax(0,1.5fr)]">
              <div>
                <span className="flex items-center gap-2 text-ink">
                  <BrandMark className="h-7 w-7 rounded-md" />
                  <T id="footer.tagline" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3">
                <nav aria-label="Product">
                  <p className="mb-2 font-semibold text-ink"><T id="footer.productHeading" /></p>
                  <div className="flex flex-col">
                    <Link
                      href="/plans"
                      className="inline-flex min-h-11 items-center transition hover:text-ink"
                    >
                      <T id="footer.plans" />
                    </Link>
                    <Link href="/tokens" className="inline-flex min-h-11 items-center transition hover:text-ink">
                      <T id="footer.extension" />
                    </Link>
                    <Link
                      href={user ? "/dashboard" : "/login"}
                      className="inline-flex min-h-11 items-center transition hover:text-ink"
                    >
                      {user ? <T id="nav.myTranscriptions" /> : <T id="footer.logIn" />}
                    </Link>
                  </div>
                </nav>
                <nav aria-label="Help">
                  <p className="mb-2 font-semibold text-ink"><T id="footer.helpHeading" /></p>
                  <div className="flex flex-col">
                    <Link href="/support" className="inline-flex min-h-11 items-center transition hover:text-ink">
                      <T id="footer.support" />
                    </Link>
                    <Link href="/billing" className="inline-flex min-h-11 items-center transition hover:text-ink">
                      <T id="footer.billing" />
                    </Link>
                  </div>
                </nav>
                <nav aria-label="Legal">
                  <p className="mb-2 font-semibold text-ink"><T id="footer.legalHeading" /></p>
                  <div className="flex flex-col">
                    <Link href="/privacy" className="inline-flex min-h-11 items-center transition hover:text-ink">
                      <T id="footer.privacy" />
                    </Link>
                    <Link href="/terms" className="inline-flex min-h-11 items-center transition hover:text-ink">
                      <T id="footer.terms" />
                    </Link>
                  </div>
                </nav>
              </div>
            </div>
          </footer>
        </ContentProvider>
      </body>
    </html>
  );
}

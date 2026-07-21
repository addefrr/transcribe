import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import JobNotifier from "@/components/JobNotifier";
import SiteHeader from "@/components/SiteHeader";
import { themeInitScript } from "@/components/ThemeToggle";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/subscriptions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Transcribe — turn audio & video into text",
  description:
    "Upload a file or paste a link and get a clean, accurate transcript in minutes. Pay only for what you use.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const admin = isAdmin(user);
  const sub = user ? await getActiveSubscription(user.id) : null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <SiteHeader
          loggedIn={!!user}
          creditBalance={user?.creditBalance ?? 0}
          admin={admin}
          hasSubscription={!!sub}
        />
        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
        {user && <JobNotifier />}
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
            <span className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded bg-ink text-[10px] text-paper">
                T
              </span>
              Transcribe — audio &amp; video to text
            </span>
            <div className="flex gap-5">
              <Link href="/plans" className="transition hover:text-ink">
                Plans
              </Link>
              <Link href="/login" className="transition hover:text-ink">
                Log in
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "./(auth)/actions";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href={user ? "/dashboard" : "/"} className="text-lg font-semibold">
              🎙️ Transcribe
            </Link>
            <div className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  <Link
                    href="/credits"
                    className="rounded-full border border-zinc-300 px-3 py-1 hover:border-indigo-500 dark:border-zinc-700"
                    title="Your credits"
                  >
                    {user.creditBalance} credits left
                  </Link>
                  <Link href="/dashboard" className="hover:underline">
                    My transcriptions
                  </Link>
                  {admin && (
                    <Link href="/developer" className="hover:underline">
                      Developer
                    </Link>
                  )}
                  <form action={logout}>
                    <button className="text-zinc-500 hover:underline" type="submit">
                      Log out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="hover:underline">
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24">{children}</main>
        <footer className="border-t border-zinc-200 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
          🎙️ Transcribe · audio &amp; video to text, the easy way
        </footer>
      </body>
    </html>
  );
}

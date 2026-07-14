import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Transcribe — pay-as-you-go AI transcription",
  description:
    "Buy credits, drop in an audio/video file or URL, get accurate Whisper transcripts.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
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
                    title="Buy credits"
                  >
                    {user.creditBalance} credits
                  </Link>
                  <Link href="/dashboard" className="hover:underline">
                    Dashboard
                  </Link>
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
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24">{children}</main>
      </body>
    </html>
  );
}

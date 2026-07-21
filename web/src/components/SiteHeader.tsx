"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/(auth)/actions";
import ThemeToggle from "./ThemeToggle";

type Props = {
  loggedIn: boolean;
  creditBalance: number;
  admin: boolean;
  hasSubscription: boolean;
};

export default function SiteHeader({ loggedIn, creditBalance, admin, hasSubscription }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = loggedIn
    ? [
        { href: "/dashboard", label: "My transcriptions" },
        { href: "/plans", label: "Plans" },
        ...(admin ? [{ href: "/developer", label: "Developer" }] : []),
      ]
    : [];

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        className={`text-sm transition ${active ? "text-ink" : "text-muted hover:text-ink"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href={loggedIn ? "/dashboard" : "/"}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[13px] text-paper">
            T
          </span>
          Transcribe
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => navLink(l.href, l.label))}
          {loggedIn ? (
            <>
              <Link
                href="/credits"
                className="rounded-full border border-line px-3 py-1 text-sm text-muted transition hover:text-ink"
              >
                {hasSubscription ? "Subscribed" : `${creditBalance} credits`}
              </Link>
              <ThemeToggle />
              <form action={logout}>
                <button type="submit" className="text-sm text-muted transition hover:text-ink">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-muted transition hover:text-ink">
                Log in
              </Link>
              <ThemeToggle />
              <Link
                href="/signup"
                className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-paper transition hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {open && (
        <div className="border-t border-line px-4 py-3 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((l) => navLink(l.href, l.label))}
            {loggedIn ? (
              <>
                {navLink("/credits", hasSubscription ? "Subscribed" : `${creditBalance} credits`)}
                <form action={logout}>
                  <button type="submit" className="text-sm text-muted transition hover:text-ink">
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <>
                {navLink("/login", "Log in")}
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="w-fit rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-paper"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

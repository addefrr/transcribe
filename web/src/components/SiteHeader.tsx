"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { T } from "./T";
import ThemeToggle from "./ThemeToggle";

type Props = {
  loggedIn: boolean;
  creditBalance: number;
  admin: boolean;
  hasSubscription: boolean;
};

/** Audio on the left, transcript lines on the right: a product-derived mark. */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-lg bg-ink text-paper ${className}`}
    >
      <svg
        viewBox="0 0 28 28"
        className="h-[72%] w-[72%]"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        focusable="false"
      >
        <path d="M4.5 11v6M7.5 8v12M10.5 10v8" strokeWidth="1.8" />
        <path d="M15 9h8M15 14h8M15 19h5.5" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

export default function SiteHeader({ loggedIn, creditBalance, admin, hasSubscription }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const creditPill = hasSubscription ? (
    <T id="nav.subscribed" />
  ) : (
    <>
      {creditBalance} <T id="nav.creditsLabel" />
    </>
  );
  const links = loggedIn
    ? [
        { href: "/dashboard", id: "nav.myTranscriptions" },
        { href: "/plans", id: "nav.plans" },
        { href: "/account", id: "nav.account" },
        ...(admin ? [{ href: "/developer", id: "nav.developer" }] : []),
      ]
    : [{ href: "/plans", id: "nav.plans" }];

  const navLink = (href: string, label: React.ReactNode, mobile = false) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
        className={`inline-flex min-h-11 items-center text-sm transition ${
          mobile ? "w-full rounded-md px-2" : ""
        } ${
          active
            ? "font-semibold text-ink underline decoration-2 decoration-brand underline-offset-8"
            : "text-muted hover:text-ink"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <nav aria-label="Primary" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex min-h-16 items-center justify-between gap-4">
          <Link
            href={loggedIn ? "/dashboard" : "/"}
            aria-label={loggedIn ? "Transcribe dashboard" : "Transcribe home"}
            className="inline-flex min-h-11 items-center gap-2.5 font-semibold tracking-tight"
          >
            <BrandMark />
            <T id="nav.brand" />
          </Link>

          <div className="hidden items-center gap-5 md:flex">
            {links.map((link) => navLink(link.href, <T id={link.id} />))}
            {loggedIn ? (
              <>
                <Link
                  href="/credits"
                  aria-current={pathname.startsWith("/credits") ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm transition ${
                    pathname.startsWith("/credits")
                      ? "border-brand font-semibold text-ink"
                      : "border-line text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  {creditPill}
                </Link>
                <ThemeToggle />
                <form action={logout}>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center px-1 text-sm text-muted transition hover:text-ink"
                  >
                    <T id="nav.logOut" />
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center px-1 text-sm text-muted transition hover:text-ink"
                >
                  <T id="nav.logIn" />
                </Link>
                <ThemeToggle />
                <Link
                  href="/signup"
                  className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-paper transition hover:opacity-90"
                >
                  <T id="nav.getStarted" />
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-primary-menu"
              onClick={() => setOpen((current) => !current)}
              className="tap-target grid place-items-center rounded-lg border border-line text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                {open ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <div
          id="mobile-primary-menu"
          hidden={!open}
          className="border-t border-line py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => navLink(link.href, <T id={link.id} />, true))}
            {loggedIn ? (
              <>
                {navLink("/credits", creditPill, true)}
                <form action={logout}>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm text-muted hover:bg-paper-2 hover:text-ink"
                  >
                    <T id="nav.logOut" />
                  </button>
                </form>
              </>
            ) : (
              <>
                {navLink("/login", <T id="nav.logIn" />, true)}
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-paper"
                >
                  <T id="nav.getStarted" />
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

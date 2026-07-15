"use client";

/**
 * Mobile-only hamburger drawer that mirrors the desktop nav links.
 * Renders below the md breakpoint; closes on route change, on Escape,
 * and on overlay click. Positioned absolute below the sticky header so
 * it sits naturally beneath the topbar.
 *
 * Used in app/layout.tsx — desktop nav stays a separate `md:flex` block.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function MobileNav({
  navItems,
  isSignedIn = false,
}: {
  navItems: { href: string; label: string }[];
  isSignedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while open so the page doesn't bleed through.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/80 hover:bg-white/10 md:hidden"
      >
        <span aria-hidden className="text-base leading-none">
          {open ? "✕" : "☰"}
        </span>
      </button>
      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-[var(--mobile-nav-top,64px)] z-30 bg-black/60 backdrop-blur md:hidden"
          />
          <nav
            id="mobile-nav-panel"
            aria-label="Mobile menu"
            className="absolute inset-x-0 top-full z-40 border-b border-white/10 bg-midnight/95 shadow-2xl md:hidden"
          >
            <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2">
              {navItems.map((item) => {
                const active = item.href === pathname;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={
                        "block rounded-2xl px-4 py-3 text-base transition " +
                        (active
                          ? "bg-white/10 text-white"
                          : "text-white/80 hover:bg-white/10 hover:text-white")
                      }
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {!isSignedIn && (
              <div className="flex gap-2 border-t border-white/10 px-4 py-3">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full border border-white/20 px-4 py-2 text-center text-sm font-medium text-white/80 hover:bg-white/10"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-center text-sm font-semibold text-white shadow-glass"
                >
                  Join
                </Link>
              </div>
            )}
          </nav>
        </>
      )}
    </>
  );
}

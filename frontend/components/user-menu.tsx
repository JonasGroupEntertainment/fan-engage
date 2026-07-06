"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface UserMenuProps {
  fan: {
    id: string;
    email: string | null | undefined;
    first_name: string | null;
    avatar_url: string | null;
    profileSlug: string | null;
  } | null;
  isAdmin: boolean;
  unreadCount?: number;
}

/**
 * Dropdown user menu. Replaces the bare "Sign out" button + name combo.
 * Opens on click, closes on click-outside or Escape.
 * Shows Fan home, Rewards, Inbox, and optionally Admin if isAdmin is true.
 */
export default function UserMenu({ fan, isAdmin, unreadCount = 0 }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!fan) return null;

  const displayName = fan.first_name ?? fan.email?.split("@")[0] ?? "Signed in";
  const initial = (fan.first_name?.[0] ?? fan.email?.[0] ?? "F").toUpperCase();

  return (
    <div className="relative">
      {/* Trigger button: avatar + name + chevron */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/80 hover:bg-white/10 transition"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={fan.email ?? undefined}
      >
        {fan.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fan.avatar_url}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-xs font-bold">
            {initial}
          </span>
        )}
        <span>{displayName}</span>
        <span
          className="text-white/60 transition"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-48 rounded-lg border border-white/15 bg-midnight/95 shadow-lg backdrop-blur"
          role="menu"
        >
          <nav className="py-1">
            {/* Fan Home */}
            <Link
              href="/"
              className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              Fan home
            </Link>

            {/* My Profile */}
            {fan.profileSlug && (
              <Link
                href={`/fans/${fan.profileSlug}`}
                className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
                role="menuitem"
                onClick={() => setIsOpen(false)}
              >
                My profile
              </Link>
            )}

                        {/* My Rewards */}
            <Link
              href="/rewards"
              className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              My rewards
            </Link>

            {/* Search */}
            <Link
              href="/search"
              className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              Search
            </Link>

            {/* Inbox */}
            <Link
              href="/inbox"
              className="block px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              Inbox
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-1 text-xs font-semibold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>

            {/* Admin (conditional) */}
            {isAdmin && (
              <>
                <div className="my-1 border-t border-white/10" />
                <Link
                  href="/admin"
                  className="block px-4 py-2 text-sm text-amber-300 hover:bg-white/10 transition"
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                >
                  Admin
                </Link>
              </>
            )}

            {/* Divider before Sign out */}
            <div className="my-1 border-t border-white/10" />

            {/* Sign out */}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition"
                role="menuitem"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      )}
    </div>
  );
}

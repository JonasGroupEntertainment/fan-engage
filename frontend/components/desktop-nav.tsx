"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DesktopNav({
  navItems,
}: {
  navItems: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 text-sm text-white/70 xl:flex">
      {navItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-full px-3 py-1.5 transition " +
              (active
                ? "bg-white/15 text-white font-medium"
                : "hover:bg-white/10 hover:text-white")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

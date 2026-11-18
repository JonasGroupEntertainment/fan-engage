import Link from "next/link";

interface AdminPillProps {
  /** If false, renders nothing. */
  show?: boolean;
}

/**
 * Small admin pill shown in the header for admins. Click to navigate to /admin.
 * Matches the FOUNDER badge aesthetic but uses an amber/orange accent.
 * Only renders if show is true.
 */
export default function AdminPill({ show = true }: AdminPillProps) {
  if (!show) return null;

  return (
    <Link
      href="/admin"
      aria-label="Admin dashboard"
      title="Admin dashboard"
      // Hidden on phones: the header has no room there, and Admin is also in
      // the menu under the fan's name (BEP #196).
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300 shadow-glass transition hover:brightness-110 sm:inline-flex"
      style={{
        backgroundImage: "linear-gradient(90deg, rgba(217, 119, 6, 0.2), rgba(217, 119, 6, 0.15))",
      }}
    >
      <span aria-hidden>🛡</span>
      <span>Admin</span>
    </Link>
  );
}

import Link from "next/link";

export const metadata = { title: "Page not found" };

// Renders inside the root layout (header + footer), replacing the bare
// Next.js default 404.
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-white/60">404</p>
      <h1
        className="text-4xl font-semibold leading-tight text-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        We couldn&apos;t find that page.
      </h1>
      <p className="text-sm text-white/70">
        The link may be out of date, or the page may have moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Link
          href="/"
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          Fan Home
        </Link>
        <Link
          href="/artists"
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
        >
          Browse artists
        </Link>
      </div>
    </main>
  );
}

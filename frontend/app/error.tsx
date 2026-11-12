"use client";

import Link from "next/link";
import { useEffect } from "react";

// Route-level error boundary. Renders inside the root layout (nav + footer
// stay up), so only the page body is replaced.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-white/60">
        Something went wrong
      </p>
      <h1
        className="text-4xl font-semibold leading-tight text-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        This page hit a snag.
      </h1>
      <p className="text-sm text-white/70">
        It&apos;s usually temporary. Try again, or head back to Fan Home.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs text-white/50">
            Reference: {error.digest}
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
        >
          Fan Home
        </Link>
      </div>
    </main>
  );
}

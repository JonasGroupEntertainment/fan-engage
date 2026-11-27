import type { Metadata } from "next";
import Link from "next/link";

// Opening /logout lands here. It does not sign anyone out by itself, so a
// link or image on another website cannot end a fan's session. The button
// POSTs to /logout, which does the real sign-out.
export const metadata: Metadata = {
  title: "Sign out",
  robots: { index: false, follow: false },
};

export default function SignOutConfirmPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-20 text-center">
      <h1 className="text-4xl font-semibold leading-tight">Sign out?</h1>
      <p className="text-sm text-white/70">You will be signed out on this device.</p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <form method="post" action="/logout">
          <button
            type="submit"
            className="rounded-lg bg-aurora px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          Stay signed in
        </Link>
      </div>
    </main>
  );
}

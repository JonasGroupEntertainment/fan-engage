import type { Metadata } from "next";
import Link from "next/link";
import { SmsOptInForm } from "./sms-opt-in-form";

export const metadata: Metadata = {
  title: "Text alerts",
  description:
    "Optional text alerts from Fan Engage Pro about artist drops, events, meet and greets, and rewards.",
};

/**
 * Public SMS opt-in. No login required. Saving a number still needs an
 * account, which /signup collects with the same unchecked consent box.
 */
export default function SmsOptInPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-wide text-white/60">Fan Engage Pro</p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Text alerts
        </h1>
        <p className="text-sm leading-relaxed text-white/70">
          Texts about artist drops, events, meet and greets, and rewards are optional.
          You can join without a phone number and without checking the box.
        </p>
      </div>
      <SmsOptInForm />
      <p className="text-center text-sm text-white/60">
        New here?{" "}
        <Link href="/signup" className="text-white underline-offset-4 hover:underline">
          Create a free account
        </Link>{" "}
        — the same phone field and text consent are on that page.
      </p>
    </main>
  );
}

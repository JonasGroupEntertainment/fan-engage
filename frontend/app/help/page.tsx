import type { Metadata } from "next";
import Link from "next/link";
import {
  OFFICIAL_CONTACT_EMAIL,
  OFFICIAL_CONTACT_MAILTO,
} from "@/lib/legal/official-contact";

export const metadata: Metadata = {
  title: "Help",
  description:
    "What Fan Engage Pro is, Founding Fan perks, Premium billing, how to cancel, refunds, and how points work.",
};

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12 text-white/80">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-white/50">Help</p>
        <h1
          className="text-3xl font-semibold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Fan Engage Pro
        </h1>
        <p className="text-sm leading-relaxed text-white/70">
          Short answers. Billing and refund details live on the policy pages.
        </p>
      </header>

      <section className="space-y-8">
        <article className="space-y-2">
          <h2 className="text-lg font-semibold text-white">What is Fan Engage Pro?</h2>
          <p className="text-sm leading-relaxed">
            Fan Engage Pro is a fan experience for artists, operated by Fan
            Engage Pro LLC, a Colorado limited liability company. Follow the
            artists you care about, earn points for showing up, RSVP to events,
            and unlock in-app rewards. Fans must be 13 or older. No one under
            13 can create an account. If you are 13 to 17, a parent or guardian
            has to say you can join. Paid memberships and text alerts stay 18
            and older.
          </p>
        </article>

        <article className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Founding Fan perks</h2>
          <p className="text-sm leading-relaxed">
            Founding Fan is free. It is not a paid plan, and it does not change
            the price of Premium. Perks are a numbered badge and 1.5× points,
            plus 48-hour early RSVP. You keep that badge and the 1.5× points
            as long as your account stays active. Cancelling Premium does not
            remove them.
          </p>
        </article>

        <article className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Premium billing</h2>
          <p className="text-sm leading-relaxed">
            Premium includes an eligible seven-day free trial, then monthly or
            yearly billing. The price is shown on the{" "}
            <Link href="/premium" className="text-white underline underline-offset-4 hover:text-white/80">
              Premium
            </Link>{" "}
            page and at checkout. There is one free trial per account. You are
            not charged until the trial ends, and you can cancel before then.
          </p>
        </article>

        <article className="space-y-2">
          <h2 className="text-lg font-semibold text-white">How to cancel</h2>
          <p className="text-sm leading-relaxed">
            Sign in, open{" "}
            <Link href="/account/billing" className="text-white underline underline-offset-4 hover:text-white/80">
              Billing
            </Link>
            , and choose Manage billing. That opens Stripe&apos;s secure portal,
            where you can cancel. What happens to the rest of a paid period is
            described in the{" "}
            <Link href="/cancellation-refund" className="text-white underline underline-offset-4 hover:text-white/80">
              Cancellation &amp; Refund Policy
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Refunds</h2>
          <p className="text-sm leading-relaxed">
            Refund rules are in the{" "}
            <Link href="/cancellation-refund" className="text-white underline underline-offset-4 hover:text-white/80">
              Cancellation &amp; Refund Policy
            </Link>{" "}
            and the{" "}
            <Link href="/terms" className="text-white underline underline-offset-4 hover:text-white/80">
              Terms of Service
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h2 className="text-lg font-semibold text-white">How points work</h2>
          <p className="text-sm leading-relaxed">
            You earn points by showing up — joining, posting, commenting,
            RSVPing, and referring friends — then spend them on in-app rewards.
            Founding Fans and Premium members earn 1.5× points on what they
            earn. Those multipliers do not stack, and spending points is not
            multiplied. Your balance lives on{" "}
            <Link href="/rewards" className="text-white underline underline-offset-4 hover:text-white/80">
              Rewards
            </Link>
            .
          </p>
        </article>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p className="text-sm leading-relaxed">
          Questions that these answers don&apos;t cover — email support.
        </p>
        {/* TODO: support@fanengagepro.com inbox is being set up. */}
        <a
          href={OFFICIAL_CONTACT_MAILTO}
          className="text-sm text-white underline underline-offset-4 hover:text-white/80"
        >
          {OFFICIAL_CONTACT_EMAIL}
        </a>
      </section>
    </main>
  );
}

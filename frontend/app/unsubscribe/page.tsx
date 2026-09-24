import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OFFICIAL_CONTACT_EMAIL,
  OFFICIAL_CONTACT_MAILTO,
} from "@/lib/legal/official-contact";

export const dynamic = "force-dynamic";

export const metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; channel?: string }>;
}) {
  const { token, channel } = await searchParams;
  const ch = channel === "sms" ? "sms" : "email";

  let status:
    | "ok"
    | "no_token"
    | "not_found"
    | "error" = "no_token";
  let firstName: string | null = null;

  if (token) {
    try {
      const admin = createAdminClient();
      const { data: fan } = await admin
        .from("fans")
        .select("id, first_name")
        .eq("unsubscribe_token", token)
        .maybeSingle();
      if (!fan) {
        status = "not_found";
      } else {
        const update =
          ch === "sms"
            ? { sms_opted_in: false }
            : { email_opted_in: false };
        await admin.from("fans").update(update).eq("id", fan.id);
        status = "ok";
        firstName = (fan.first_name as string | null) ?? null;
      }
    } catch {
      status = "error";
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      {status === "ok" && (
        <>
          <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            You&apos;re unsubscribed{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="text-sm text-white/70">
            We&apos;ve stopped sending {ch === "sms" ? "text messages" : "email"} from Fan Engage.
            You can turn it back on anytime from your profile.
          </p>
        </>
      )}
      {status === "not_found" && (
        <>
          <h1 className="text-2xl font-semibold">Link not recognized</h1>
          <p className="text-sm text-white/70">
            The unsubscribe token in this link doesn&apos;t match any account. If you&apos;re still
            getting messages you don&apos;t want, email{" "}
            <a href={OFFICIAL_CONTACT_MAILTO} className="underline">{OFFICIAL_CONTACT_EMAIL}</a>.
          </p>
        </>
      )}
      {status === "no_token" && (
        <>
          <h1 className="text-2xl font-semibold">Missing unsubscribe token</h1>
          <p className="text-sm text-white/70">
            Unsubscribe links in our emails include a token. Use the link in a recent email, or
            email{" "}
            <a href={OFFICIAL_CONTACT_MAILTO} className="underline">{OFFICIAL_CONTACT_EMAIL}</a>{" "}
            for help.
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-white/70">
            Please try again in a moment, or email{" "}
            <a href={OFFICIAL_CONTACT_MAILTO} className="underline">{OFFICIAL_CONTACT_EMAIL}</a>.
          </p>
        </>
      )}
      <Link
        href="/"
        className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 hover:bg-white/10"
      >
        ← Fan Home
      </Link>
    </main>
  );
}

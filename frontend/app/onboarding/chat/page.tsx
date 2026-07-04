/**
 * /onboarding/chat
 *
 * AI #9: Conversational onboarding (post-signup enrichment).
 * Reachable for any signed-in fan. Greets them by first name and hands
 * off to a Claude-led chat that fills in city, favorite_song, interest,
 * and sms_opted_in.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingChatClient from "./onboarding-chat-client";

export const dynamic = "force-dynamic";

export default async function OnboardingChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding/chat");

  const { data: fan } = await supabase
    .from("fans")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();
  const firstName = (fan as { first_name?: string | null } | null)?.first_name ?? null;

  const greeting = firstName
    ? `Hey ${firstName} — welcome in. I'm gonna ask 4 quick questions so we can tune Fan Engage to you. What song made you a fan?`
    : `Hey, welcome in. I'm gonna ask 4 quick questions so we can tune Fan Engage to you. What song made you a fan?`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Welcome
        </p>
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          A few quick things
        </h1>
        <p className="max-w-xl text-sm text-white/70">
          Chat with Claude for a minute so Fan Engage knows who you are —
          city, music streaming service, why you&apos;re here. You can skip and finish
          later from your profile.
        </p>
      </header>

      <OnboardingChatClient initialMessage={greeting} />
    </main>
  );
}

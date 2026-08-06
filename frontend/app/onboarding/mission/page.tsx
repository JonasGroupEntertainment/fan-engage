"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";

interface Step {
  id: number;
  title: string;
  description: string;
  cta: string;
  href: string;
  done: boolean;
}

export default function MissionPage() {
  const router = useRouter();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 1,
      title: "Follow an artist",
      description: "Connect with your first artist community.",
      cta: "Browse artists",
      href: "/artists",
      done: false,
    },
    {
      id: 2,
      title: "Earn your first badge",
      description: "Complete an action on the platform to unlock a badge.",
      cta: "Go to home",
      href: "/",
      done: false,
    },
    {
      id: 3,
      title: "Invite a friend",
      description: "Share your personal invite link and bring someone in.",
      cta: "Copy link",
      href: "#invite",
      done: false,
    },
  ]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signup?next=/onboarding/mission");
        return;
      }

      const [followResult, badgeResult, fanResult] = await Promise.all([
        supabase
          .from("fan_artist_following")
          .select("fan_id", { count: "exact", head: true })
          .eq("fan_id", user.id),
        supabase
          .from("fan_badges")
          .select("fan_id", { count: "exact", head: true })
          .eq("fan_id", user.id),
        supabase
          .from("fans")
          .select("referral_code")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const followsDone = (followResult.count ?? 0) > 0;
      const badgesDone = (badgeResult.count ?? 0) > 0;
      const code = fanResult.data?.referral_code ?? null;
      setReferralCode(code);

      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === 1) return { ...s, done: followsDone };
          if (s.id === 2) return { ...s, done: badgesDone };
          return s;
        })
      );
      setLoading(false);
    }
    load();
  }, [router]);

  const inviteUrl = referralCode ? `${APP_URL}/invite/${referralCode}` : null;
  const allDone = steps.every((s) => s.done);

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050b1f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050b1f] text-white flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg flex flex-col gap-6">
        <div className="text-center flex flex-col gap-2">
          <p className="text-xs tracking-widest uppercase text-white/50">
            You&apos;re in
          </p>
          <h1 className="text-3xl font-bold">Complete your first missions</h1>
          <p className="text-white/50 text-sm">
            Three quick steps to unlock the full experience.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {steps.map((step, idx) => {
            const isInvite = step.id === 3;
            const isLocked = !loading && idx > 0 && !steps[idx - 1].done;

            return (
              <div
                key={step.id}
                className={`rounded-2xl border p-5 flex items-start gap-4 transition-opacity ${
                  isLocked ? "opacity-40" : "opacity-100"
                } ${
                  step.done
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step.done
                      ? "bg-emerald-500 text-white"
                      : "bg-white/10 text-white/50"
                  }`}
                >
                  {step.done ? "✓" : step.id}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-semibold text-sm">{step.title}</p>
                    <p className="text-white/50 text-xs">{step.description}</p>
                  </div>
                  {!step.done && !isLocked && (
                    isInvite ? (
                      inviteUrl ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-xs text-white/60 font-mono break-all">
                            {inviteUrl}
                          </div>
                          <button
                            onClick={handleCopy}
                            className="self-start text-xs font-semibold px-4 py-2 rounded-lg bg-white text-[#050b1f] hover:bg-white/90 transition-colors"
                          >
                            {copied ? "Copied!" : step.cta}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-white/30 italic">
                          Referral link loading…
                        </p>
                      )
                    ) : (
                      <Link
                        href={step.href}
                        className="self-start text-xs font-semibold px-4 py-2 rounded-lg bg-white text-[#050b1f] hover:bg-white/90 transition-colors"
                      >
                        {step.cta}
                      </Link>
                    )
                  )}
                  {step.done && (
                    <p className="text-xs text-emerald-400 font-medium">
                      Done
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {allDone ? (
          <Link
            href="/"
            className="w-full text-center py-3 rounded-xl font-semibold text-sm bg-white text-[#050b1f] hover:bg-white/90 transition-colors"
          >
            Go to your feed →
          </Link>
        ) : (
          <Link
            href="/"
            className="text-center text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Skip for now
          </Link>
        )}
      </div>
    </main>
  );
}

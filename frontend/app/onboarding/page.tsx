"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Star, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Field = {
  label: string;
  name: string;
  placeholder?: string;
  type: "text" | "email" | "tel" | "radio";
  options?: string[];
  otherOptionLabel?: string;
  otherFieldName?: string;
  otherPlaceholder?: string;
  required?: boolean;
  readOnly?: boolean;
  hint?: string;
};

const MUSIC_OUTLET_OPTIONS = [
  "Spotify",
  "Apple Music",
  "Amazon Music",
  "TikTok",
  "YouTube",
  "Radio",
  "Other",
];

const steps: { title: string; description: string; fields: Field[] }[] = [
  {
    title: "Fan Profile",
    description: "Capture the basics so the experience can personalize immediately.",
    fields: [
      {
        label: "Preferred name",
        name: "firstName",
        placeholder: "Taylor",
        type: "text",
        required: true,
      },
      {
        label: "Email",
        name: "email",
        placeholder: "taylor@email.com",
        type: "email",
        readOnly: true,
        hint: "From your account.",
      },
      {
        label: "City & state",
        name: "city",
        placeholder: "Austin, TX",
        type: "text",
      },
    ],
  },
  {
    title: "Interests",
    description: "Fans choose what they care about—rewards, marketplace drops, live moments.",
    fields: [
      {
        label: "What are your areas of interest?",
        name: "interest",
        placeholder: "Rewards, VIP, Marketplace",
        type: "text",
        required: true,
      },
      {
        label: "Where do you listen to music most?",
        name: "musicOutlet",
        type: "radio",
        options: MUSIC_OUTLET_OPTIONS,
        otherOptionLabel: "Other",
        otherFieldName: "musicOutletOther",
        otherPlaceholder: "Tell us your favorite outlet",
      },
    ],
  },
  {
    title: "Access & Loyalty",
    description: "Tie their phone and socials to automate points + referrals.",
    fields: [
      {
        label: "Phone number",
        name: "phone",
        placeholder: "+1 (615) 555-0123",
        type: "tel",
        hint: "Recommended — unlocks SMS perks for artist drops, events, and rewards.",
      },
      {
        label: "TikTok or Instagram handle",
        name: "handle",
        placeholder: "@fanexperience",
        type: "text",
      },
    ],
  },
];

const checklist = [
  { label: "Preferences saved", value: "Ready" },
  { label: "SMS double opt-in", value: "Auto" },
  { label: "Referral code", value: "Generated" },
  { label: "Community badge", value: "Unlocked" },
];

const experiences = [
  { title: "Supernova Weekend", detail: "3-day VIP itinerary + challenge roadmap" },
  { title: "Marketplace Passport", detail: "Auto grants Bronze badge + merch credits" },
  { title: "Text-to-stage", detail: "SMS prompts that turn into instant point bursts" },
];

export default function OnboardingWizard() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [smsStatus, setSmsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [smsMessage, setSmsMessage] = useState("Ready to send the confirmation text.");
  const [finishStatus, setFinishStatus] = useState<"idle" | "saving" | "error">("idle");
  const [tosConsent, setTosConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  // Tracks whether the email field was successfully auto-prefilled from
  // auth.users. When true, the field stays readOnly (no risk of typo
  // changing what's already on the account). When false, the field is
  // editable + required so anonymous visitors / OAuth-without-email
  // sessions / timed-out sessions can still complete onboarding.
  const [emailAutoFilled, setEmailAutoFilled] = useState(false);

  const currentStep = steps[stepIndex];
  const progress = useMemo(() => ((stepIndex + 1) / steps.length) * 100, [stepIndex]);

  // Pre-fill the email field from the authenticated user. The wizard already
  // sits behind /signup so by the time someone reaches /onboarding their
  // email is in auth.users — make it visible (read-only) instead of asking
  // them to retype it.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        // Anonymous visitor (or expired session) — onboarding wizard
        // expects an authenticated user. Send them to /signup with a
        // return URL so the auth callback bounces them back here.
        const searchParams = new URLSearchParams(window.location.search);
        const rawNext = searchParams.get("next");
        const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/onboarding";
        const ref = searchParams.get("ref");
        const params = new URLSearchParams({ next });
        if (ref) params.set("ref", ref);
        router.replace(`/signup?${params.toString()}`);
        return;
      }
      if (user.email) {
        setFormState((prev) => ({ ...prev, email: user.email ?? "" }));
        setEmailAutoFilled(true);
      }
    });
  }, [router]);

  const handleInput = (name: string, value: string) => {
    setFormState((prev) => ({ ...prev, [name]: value }));
    if (name === "phone" && !value.trim()) setSmsConsent(false);
  };

  /**
   * Resolves the music outlet selection. If the user picked "Other" and
   * filled in the freeform text, returns that text; otherwise returns the
   * selected option (or null if nothing was picked).
   */
  const resolveMusicOutlet = (): string | null => {
    const sel = formState.musicOutlet;
    if (!sel) return null;
    if (sel === "Other") {
      const other = formState.musicOutletOther?.trim();
      return other && other.length > 0 ? other : "Other";
    }
    return sel;
  };

  /**
   * Returns true if all required fields in the current step are filled.
   * Drives the disabled state of the "Continue" button.
   *
   * Special case: the email field is treated as required when it's
   * editable (i.e. auth prefill failed). The Field type's `required`
   * flag stays false so the asterisk doesn't render in the prefilled
   * case, but we gate Continue on the typed-in value here.
   */
  const canAdvanceCurrentStep = (): boolean => {
    return currentStep.fields.every((field) => {
      if (field.name === "email" && !emailAutoFilled) {
        const v = formState.email?.trim() ?? "";
        // Basic email shape; server-side validation is the real gate.
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      }
      if (!field.required) return true;
      if (field.type === "radio") {
        const sel = formState[field.name];
        if (!sel) return false;
        if (sel === field.otherOptionLabel) {
          return Boolean(field.otherFieldName && formState[field.otherFieldName]?.trim());
        }
        return true;
      }
      return Boolean(formState[field.name]?.trim());
    });
  };

  const nextStep = () => setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  const prevStep = () => setStepIndex((prev) => Math.max(prev - 1, 0));

  const handleSmsOptIn = async () => {
    if (!formState.phone) {
      setSmsStatus("error");
      setSmsMessage("Add a phone number to trigger the confirmation message.");
      return;
    }

    try {
      setSmsStatus("loading");
      setSmsMessage("Sending confirmation text...");
      const response = await fetch("/api/fan-engage/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formState.phone,
          firstName: formState.firstName,
          interest: formState.interest,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send SMS");
      }

      setSmsStatus("success");
      setSmsMessage("Confirmation text delivered. Fan is live in the journey.");

      // Fire-and-forget Mailchimp subscribe — don't block the SMS success path
      // if Mailchimp isn't configured yet or the audience ID is missing.
      if (formState.email) {
        fetch("/api/fan-engage/mailchimp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formState.email,
            firstName: formState.firstName,
            tags: formState.interest ? [formState.interest] : undefined,
          }),
        }).catch((err) => {
          console.warn("Mailchimp subscribe did not complete:", err);
        });
      }

      // Fire-and-forget backend onboarding completion.
      const refCode =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref") ?? undefined
          : undefined;
      fetch("/api/fan-engage/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formState.firstName,
          city: formState.city,
          phone: formState.phone,
          handle: formState.handle,
          musicOutlet: resolveMusicOutlet(),
          interest: formState.interest,
          referralCode: refCode,
          smsOptedIn: true,
          emailOptedIn: Boolean(formState.email),
        }),
      }).catch((err) => {
        console.warn("Onboarding completion did not persist:", err);
      });
    } catch (error) {
      console.error(error);
      setSmsStatus("error");
      setSmsMessage("Twilio did not accept the request. Double-check the number and try again.");
    }
  };

  /**
   * Final-step submit: persists the profile, awards the signup bonus, sends
   * the Twilio SMS (if a phone is provided), fires Mailchimp, and routes
   * home. Doesn't require a phone — the wizard shouldn't dead-end on an
   * optional field.
   */
  const handleFinish = async () => {
    try {
      setFinishStatus("saving");

      const refFromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref") ?? undefined
          : undefined;
      const refFromCookie =
        typeof document !== "undefined"
          ? document.cookie
              .split("; ")
              .find((c) => c.startsWith("fanengage_ref="))
              ?.split("=")[1]
          : undefined;
      const refCode = refFromUrl ?? refFromCookie;
      const onboardRes = await fetch("/api/fan-engage/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formState.firstName,
          city: formState.city,
          phone: formState.phone,
          handle: formState.handle,
          musicOutlet: resolveMusicOutlet(),
          interest: formState.interest,
          referralCode: refCode,
          communitySlug: refCode,
          smsOptedIn: Boolean(formState.phone) && smsConsent,
          emailOptedIn: Boolean(formState.email),
          consentAcceptedAt: new Date().toISOString(),
          consentVersion: "2026-04-22.v1",
        }),
      });

      if (!onboardRes.ok) {
        throw new Error(`Onboarding save failed (${onboardRes.status})`);
      }

      if (refFromCookie && typeof document !== "undefined") {
        document.cookie = "fanengage_ref=; path=/; max-age=0";
      }

      if (formState.email) {
        const tags = ["welcome"];
        if (formState.interest) tags.push(formState.interest);
        fetch("/api/fan-engage/mailchimp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formState.email,
            firstName: formState.firstName,
            tags,
          }),
        }).catch((err) => console.warn("Mailchimp subscribe did not complete:", err));
      }

      if (formState.phone) {
        fetch("/api/fan-engage/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: formState.phone,
            firstName: formState.firstName,
            interest: formState.interest,
          }),
        }).catch((err) => console.warn("Twilio SMS did not complete:", err));
      }

      // If the fan came in through an artist page, land them directly on
      // that artist with the welcome celebration instead of the generic
      // mission page — the artist page IS the product they signed up for.
      const onboardData = (await onboardRes.json().catch(() => null)) as
        | { communityJoined?: string | null }
        | null;
      if (onboardData?.communityJoined) {
        router.push(`/artists/${onboardData.communityJoined}?welcome=1`);
      } else {
        router.push("/onboarding/mission");
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      setFinishStatus("error");
    }
  };

  const isLastStep = stepIndex === steps.length - 1;
  const stepValid = canAdvanceCurrentStep();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 lg:flex-row">
        <section className="w-full max-w-3xl rounded-3xl border border-white/10 bg-black/40 p-8">
          <div className="flex items-center justify-between text-sm uppercase tracking-[0.3em] text-white/60">
            <span>Onboarding wizard</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/60">Step {stepIndex + 1}</p>
              <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                {currentStep.title}
              </h1>
              <p className="mt-2 text-white/70">{currentStep.description}</p>
            </div>

            <div className="space-y-4">
              {currentStep.fields.map((field) => {
                if (field.type === "radio" && field.options) {
                  const selected = formState[field.name] ?? "";
                  const isOther = selected === field.otherOptionLabel;
                  return (
                    <div key={field.name} className="block text-sm text-white/80">
                      <p>
                        {field.label}
                        {field.required && <span className="ml-1 text-rose-300">*</span>}
                      </p>
                      <div className="mt-2 space-y-2">
                        {field.options.map((opt) => (
                          <label
                            key={opt}
                            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
                          >
                            <input
                              type="radio"
                              name={field.name}
                              value={opt}
                              checked={selected === opt}
                              onChange={() => handleInput(field.name, opt)}
                              className="h-4 w-4 accent-aurora"
                            />
                            <span className="text-white/90">{opt}</span>
                          </label>
                        ))}
                        {isOther && field.otherFieldName && (
                          <input
                            type="text"
                            value={formState[field.otherFieldName] ?? ""}
                            onChange={(event) =>
                              handleInput(field.otherFieldName!, event.target.value)
                            }
                            placeholder={field.otherPlaceholder ?? "Other"}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
                          />
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <label key={field.name} className="block text-sm text-white/80">
                    <span>
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-300">*</span>}
                    </span>
                    {(() => {
                      // Email is the only field with a runtime-overridable
                      // readOnly. When auth prefill found an email, lock
                      // it (no risk of typos changing the account email).
                      // When prefill failed, leave it editable so the fan
                      // can actually type their email and proceed.
                      const fieldReadOnly =
                        field.readOnly &&
                        (field.name !== "email" || emailAutoFilled);
                      return (
                        <input
                          type={field.type}
                          value={formState[field.name] ?? ""}
                          onChange={(event) => handleInput(field.name, event.target.value)}
                          placeholder={field.placeholder}
                          readOnly={fieldReadOnly}
                          required={
                            field.required ||
                            (field.name === "email" && !emailAutoFilled)
                          }
                          className={`mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none ${
                            fieldReadOnly ? "cursor-not-allowed text-white/60" : ""
                          }`}
                        />
                      );
                    })()}
                    {field.hint && (
                      <span className="mt-1 block text-xs text-white/50">
                        {field.name === "email" && !emailAutoFilled
                          ? "We'll use this to send your weekly digest and confirmations."
                          : field.hint}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {isLastStep && (
              <div className="space-y-2 rounded-2xl bg-black/30 p-4 text-xs text-white/75">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={tosConsent}
                    onChange={(e) => setTosConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-aurora"
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="text-aurora underline"
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="text-aurora underline"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
                {formState.phone && (
                  <label className="flex items-center gap-3 py-1">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={smsConsent}
                        onChange={(e) => setSmsConsent(e.target.checked)}
                        className="h-5 w-5 accent-aurora"
                      />
                    </span>
                    <span>
                      I consent to receive SMS from Fan Engage about artist drops, events, and
                      rewards. Msg &amp; data rates may apply. Reply STOP to opt out.
                    </span>
                  </label>
                )}
              </div>
            )}

            {isLastStep && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <Star className="text-amber-300" size={18} />
              <p>SMS double opt-in</p>
            </div>
            <p className="mt-3 text-sm text-white/60">{smsMessage}</p>
            <button
              onClick={handleSmsOptIn}
              className="mt-4 rounded-full border border-white/30 px-4 py-2 text-sm text-white/80 disabled:opacity-40"
              disabled={smsStatus === "loading"}
            >
              {smsStatus === "loading" ? "Sending..." : "Send confirmation text"}
            </button>
            {smsStatus === "success" && (
              <p className="mt-2 text-sm text-emerald-300">Opt-in confirmed via Twilio.</p>
            )}
            {smsStatus === "error" && (
              <p className="mt-2 text-sm text-rose-300">Issue sending SMS. Try again.</p>
            )}
          </div>
            )}

            <div className="flex flex-col gap-2 pt-4">
              <div className="flex items-center justify-between gap-4">
                <button
                  className="text-sm text-white/60 disabled:opacity-30"
                  disabled={stepIndex === 0}
                  onClick={prevStep}
                >
                  Back
                </button>
                {isLastStep ? (
                  <button
                    onClick={handleFinish}
                    disabled={
                      finishStatus === "saving" ||
                      !tosConsent ||
                      (Boolean(formState.phone) && !smsConsent)
                    }
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-50"
                  >
                    {finishStatus === "saving" ? "Saving…" : "Finish onboarding"}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={nextStep}
                    disabled={!stepValid}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                )}
              </div>
              {!isLastStep && !stepValid && (
                <p className="text-right text-xs text-white/50">
                  Fill in the required fields (
                  <span className="text-rose-300">*</span>) to continue.
                </p>
              )}
            </div>
            {finishStatus === "error" && (
              <p className="text-sm text-rose-300">
                Could not save your profile. Are you still signed in? Try{" "}
                <a href="/login" className="underline">signing in</a> and retrying.
              </p>
            )}
          </div>

</section>

        <aside className="flex-1 space-y-6">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-700/20 via-slate-900 to-black p-6">
            <div className="flex items-center gap-3 text-white/70">
              <Users size={20} className="text-cyan-300" />
              <p className="text-xs uppercase tracking-wide">Experience preview</p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Plan the first 72 hours</h2>
            <div className="mt-4 space-y-4">
              {experiences.map((experience) => (
                <div key={experience.title} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-sm font-semibold">{experience.title}</p>
                  <p className="text-xs text-white/60">{experience.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs uppercase tracking-wide text-white/60">Launch checklist</p>
            <div className="mt-4 space-y-3">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-300" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className="text-xs text-white/60">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

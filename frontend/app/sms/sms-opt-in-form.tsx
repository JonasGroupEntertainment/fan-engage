"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { SmsConsentCopy } from "@/components/sms-consent-copy";
import { PHONE_INPUT_PATTERN } from "@/lib/phone";
import { publicSmsOptIn } from "@/lib/sms-public-opt-in";

/**
 * Logged-out visitors can read the disclosure and the unchecked box.
 * The number is stored on the signup form, which uses the same rules.
 * This page does not send a text.
 */
export function SmsOptInForm() {
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const sms = publicSmsOptIn(smsConsent, phone);
    setPhoneError(sms.error);
    if (sms.error) return;
    window.location.assign("/signup");
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6" noValidate>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-white/60">
          Mobile phone <span className="normal-case tracking-normal text-white/40">(optional)</span>
        </span>
        <input
          type="tel"
          name="phone"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          pattern={PHONE_INPUT_PATTERN}
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneError) setPhoneError(publicSmsOptIn(smsConsent, e.target.value).error);
          }}
          onBlur={() => setPhoneError(publicSmsOptIn(smsConsent, phone).error)}
          aria-invalid={!!phoneError}
          className={
            "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:outline-none " +
            (phoneError
              ? "border-rose-500/60 focus:border-rose-400"
              : "border-white/10 focus:border-white/40")
          }
          placeholder="+1 (615) 555-0123"
        />
        {phoneError ? (
          <span className="text-xs text-rose-300">{phoneError}</span>
        ) : (
          <span className="text-xs text-white/45">Optional. You can leave this blank.</span>
        )}
      </label>

      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-white/70">
        <input
          type="checkbox"
          name="sms-consent"
          checked={smsConsent}
          onChange={(e) => setSmsConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-aurora"
        />
        <SmsConsentCopy linkClassName="text-white/85 underline underline-offset-4 hover:text-white" />
      </label>
      {smsConsent && !phone.trim() && (
        <p className="text-xs text-white/45">
          Add a mobile number if you want texts. The box does not opt you in without one.
        </p>
      )}

      <button
        type="submit"
        className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass"
      >
        Continue to signup
      </button>
      <p className="text-xs text-white/45">
        This page does not send a text. Consent is saved when you create an account on{" "}
        <Link href="/signup" className="underline underline-offset-2 hover:text-white">
          the signup page
        </Link>
        .
      </p>
    </form>
  );
}

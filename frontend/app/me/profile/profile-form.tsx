"use client";

import { useActionState } from "react";
import ImageUploader from "@/components/image-uploader";
import { INVALID_PHONE_MESSAGE, PHONE_INPUT_PATTERN } from "@/lib/phone";
import { INITIAL_PROFILE_FORM_STATE, type ProfileFormValues } from "@/lib/profile-form";
import { updateProfileAction } from "./actions";

const INPUT_CLASS =
  "mt-2 w-full rounded-2xl border bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:outline-none";
const INPUT_BORDER = "border-white/10 focus:border-white/40";
const INPUT_BORDER_ERROR = "border-rose-400/70 focus:border-rose-300";

type TextFieldProps = {
  label: string;
  name: keyof ProfileFormValues;
  defaultValue: string;
  placeholder: string;
};

function TextField({ label, name, defaultValue, placeholder }: TextFieldProps) {
  return (
    <label className="block text-sm text-white/80">
      <span>{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${INPUT_BORDER}`}
      />
    </label>
  );
}

export default function ProfileForm({ initialValues }: { initialValues: ProfileFormValues }) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    INITIAL_PROFILE_FORM_STATE,
  );

  // After a rejected submit, every field re-renders from what the fan typed,
  // not from the database row. The form is keyed on the attempt count so the
  // inputs remount with those values; that does not depend on how React's
  // automatic form reset is timed against the server action.
  const values = state.error ? state.values : initialValues;
  const hasPhoneError = state.error === "phone";
  const hasSaveError = state.error === "save";

  return (
    <form key={state.attempt} action={formAction} className="space-y-5">
      <TextField
        label="First name"
        name="firstName"
        defaultValue={values.firstName}
        placeholder="Your first name"
      />
      <TextField
        label="Last name"
        name="lastName"
        defaultValue={values.lastName}
        placeholder="Your last name"
      />
      <TextField
        label="City & state"
        name="city"
        defaultValue={values.city}
        placeholder="Austin, TX"
      />

      <label className="block text-sm text-white/80">
        <span>Phone number</span>
        <input
          type="tel"
          name="phone"
          defaultValue={values.phone}
          placeholder="+1 (615) 555-0123"
          pattern={PHONE_INPUT_PATTERN}
          title={INVALID_PHONE_MESSAGE}
          aria-invalid={hasPhoneError || undefined}
          aria-describedby={hasPhoneError ? "phone-error phone-hint" : "phone-hint"}
          className={`${INPUT_CLASS} ${hasPhoneError ? INPUT_BORDER_ERROR : INPUT_BORDER}`}
        />
        {hasPhoneError && (
          <span id="phone-error" role="alert" className="mt-1 block text-xs text-rose-300">
            {state.message}
          </span>
        )}
        <span id="phone-hint" className="mt-1 block text-xs text-white/50">
          Recommended. Unlocks SMS perks for artist drops, events, and rewards.
        </span>
      </label>

      <TextField
        label="What are your areas of interest?"
        name="interest"
        defaultValue={values.interest}
        placeholder="Rewards, VIP, Marketplace"
      />
      <TextField
        label="Where do you listen to music most?"
        name="musicOutlet"
        defaultValue={values.musicOutlet}
        placeholder="Spotify, Apple Music, TikTok…"
      />
      <TextField
        label="TikTok or Instagram handle"
        name="instagramOrTiktok"
        defaultValue={values.instagramOrTiktok}
        placeholder="@fanexperience"
      />

      <div className="block text-sm text-white/80">
        <span>Avatar</span>
        <div className="mt-2">
          <ImageUploader
            bucket="avatars"
            name="avatarUrl"
            initialUrl={values.avatarUrl || null}
            label="Change avatar"
          />
        </div>
      </div>

      {hasSaveError && (
        <p role="alert" className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <a href="/me" className="text-sm text-white/60 hover:text-white transition-colors">
          Cancel
        </a>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { saveBirthDateAction } from "@/app/account/birth-date/actions";
import { AGE_REQUIRED_MESSAGE } from "@/lib/age-gate";

const FIELDS = [
  { name: "month", label: "Month", max: 2, auto: "bday-month", ph: "MM" },
  { name: "day", label: "Day", max: 2, auto: "bday-day", ph: "DD" },
  { name: "year", label: "Year", max: 4, auto: "bday-year", ph: "YYYY" },
] as const;

/** Asks a signed-in fan for a date of birth, then returns them to `next`. */
export function BirthDateForm({ next }: { next: string }) {
  const [result, action, pending] = useActionState(saveBirthDateAction, null);

  if (result?.blocked) {
    return (
      <p role="status" className="text-sm text-white/75">
        {result.error}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-white/75">{AGE_REQUIRED_MESSAGE}</p>
      <input type="hidden" name="next" value={next} />
      <fieldset className="space-y-1">
        <legend className="text-xs uppercase tracking-wide text-white/60">Date of birth</legend>
        <div className="grid max-w-sm grid-cols-[1fr_1fr_1.4fr] gap-2">
          {FIELDS.map((f) => (
            <input
              key={f.name}
              name={f.name}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={f.auto}
              aria-label={`Birth ${f.label.toLowerCase()}`}
              maxLength={f.max}
              placeholder={f.ph}
              required
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
          ))}
        </div>
      </fieldset>
      {result?.error && <p className="text-xs text-rose-300">{result.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

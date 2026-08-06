"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "./setup-actions";

interface Props {
  slug: string;
  tagline: string;
  bio: string;
}

export default function ProfileForm({ slug, tagline, bio }: Props) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { kind: "idle" | "ok" | "err"; msg?: string }
  >({ kind: "idle" });
  const [taglineVal, setTaglineVal] = useState(tagline);
  const [bioVal, setBioVal] = useState(bio);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus({ kind: "idle" });
    startTransition(async () => {
      const r = await updateProfileAction(fd);
      setStatus(
        r.ok
          ? { kind: "ok", msg: r.message ?? "Saved" }
          : { kind: "err", msg: r.error ?? "Failed to save" },
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <div>
        <label
          htmlFor="tagline"
          className="block text-xs font-medium uppercase tracking-wider text-white/55"
        >
          Tagline
        </label>
        <input
          id="tagline"
          name="tagline"
          type="text"
          maxLength={120}
          value={taglineVal}
          onChange={(e) => setTaglineVal(e.target.value)}
          placeholder="One short line that lives under the artist name"
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm placeholder:text-white/30 focus:border-aurora focus:outline-none"
        />
        <p className="mt-1 text-xs text-white/50">
          {taglineVal.length}/120
        </p>
      </div>

      <div>
        <label
          htmlFor="bio"
          className="block text-xs font-medium uppercase tracking-wider text-white/55"
        >
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={5}
          maxLength={1000}
          value={bioVal}
          onChange={(e) => setBioVal(e.target.value)}
          placeholder="2-4 sentences about the artist. This shows in the About block on the public page."
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm placeholder:text-white/30 focus:border-aurora focus:outline-none"
        />
        <p className="mt-1 text-xs text-white/50">{bioVal.length}/1000</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {status.kind === "ok" && (
          <span className="text-xs text-emerald-300">{status.msg}</span>
        )}
        {status.kind === "err" && (
          <span className="text-xs text-rose-300">{status.msg}</span>
        )}
      </div>
    </form>
  );
}

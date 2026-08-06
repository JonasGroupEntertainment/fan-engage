"use client";

import { useState, useTransition } from "react";
import { updateSocialAction } from "./setup-actions";

interface Existing {
  label: string;
  href: string;
}

interface Props {
  slug: string;
  social: Existing[];
}

const FIELDS: Array<{
  key: string;
  label: string;
  prefix: string;
  placeholder: string;
  hint?: string;
}> = [
  {
    key: "instagram",
    label: "Instagram",
    prefix: "instagram.com/",
    placeholder: "username",
  },
  {
    key: "tiktok",
    label: "TikTok",
    prefix: "tiktok.com/@",
    placeholder: "username",
  },
  {
    key: "spotify",
    label: "Spotify",
    prefix: "",
    placeholder: "https://open.spotify.com/artist/…",
    hint: "Paste the full Spotify artist page URL.",
  },
  {
    key: "youtube",
    label: "YouTube",
    prefix: "youtube.com/@",
    placeholder: "handle",
  },
  {
    key: "twitter",
    label: "Twitter / X",
    prefix: "twitter.com/",
    placeholder: "username",
  },
];

/**
 * Best-effort — extract the handle/path that comes after the platform
 * prefix from an existing href so the form can pre-populate.
 */
function deriveHandle(label: string, href: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("spotify")) return href; // full URL
  // strip protocol + host
  try {
    const u = new URL(href);
    let path = u.pathname.replace(/^\/+/, "");
    path = path.replace(/^@/, "");
    return path;
  } catch {
    return href.replace(/^@/, "");
  }
}

export default function SocialForm({ slug, social }: Props) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { kind: "idle" | "ok" | "err"; msg?: string }
  >({ kind: "idle" });

  // Build initial state by matching existing social entries by label.
  const initial: Record<string, string> = {};
  for (const f of FIELDS) {
    const match = social.find(
      (s) => s.label.toLowerCase() === f.label.toLowerCase().split(" ")[0],
    );
    initial[f.key] = match ? deriveHandle(f.label, match.href) : "";
  }
  const [values, setValues] = useState<Record<string, string>>(initial);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus({ kind: "idle" });
    startTransition(async () => {
      const r = await updateSocialAction(fd);
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

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`${f.key}_handle`}
              className="block text-xs font-medium uppercase tracking-wider text-white/55"
            >
              {f.label}
            </label>
            <div className="mt-2 flex items-stretch overflow-hidden rounded-lg border border-white/15 bg-black/30 focus-within:border-aurora">
              {f.prefix && (
                <span className="flex items-center px-3 text-xs text-white/50">
                  {f.prefix}
                </span>
              )}
              <input
                id={`${f.key}_handle`}
                name={`${f.key}_handle`}
                type="text"
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                className="flex-1 bg-transparent px-2 py-2 text-sm placeholder:text-white/30 focus:outline-none"
              />
            </div>
            {f.hint && (
              <p className="mt-1 text-xs text-white/50">{f.hint}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save social links"}
        </button>
        <p className="text-xs text-white/50">
          Empty fields are skipped. Re-saving overwrites the full set.
        </p>
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

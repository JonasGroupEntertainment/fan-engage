"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import type { PresaveAdminRow } from "@/lib/presave/read";
import { PRESAVE_DEFAULT_POINTS, PRESAVE_GRACE_DAYS, PRESAVE_HONEST_COPY } from "@/lib/presave/core";
import {
  createPresaveAction,
  togglePresaveActiveAction,
  updatePresaveAction,
} from "./presave-actions";

/**
 * Pre-save manager on /admin/artists/[slug]. One list of existing rows (edit
 * inline, pause / resume) plus an "Add pre-save" form. Same useFormSave
 * retry + status pattern as CreateEventForm.
 */
export default function PresaveManager({
  slug,
  presaves,
}: {
  slug: string;
  presaves: PresaveAdminRow[];
}) {
  return (
    <section className="glass-card p-5">
      <p className="text-sm font-semibold">Pre-saves</p>
      <p className="mt-1 text-xs text-white/60">
        A &quot;Pre-save &lt;title&gt;&quot; card on the artist page and in the community feed. It opens the
        link in a new tab and pays the points once per fan. Fans are told: &ldquo;{PRESAVE_HONEST_COPY}&rdquo;
        The card stays live until {PRESAVE_GRACE_DAYS} days after the release date (blank = no date gating).
      </p>
      <div className="mt-3 space-y-3">
        {presaves.length === 0 && <p className="text-xs text-white/50">No pre-saves yet.</p>}
        {presaves.map((p) => (
          <PresaveRow key={p.id} slug={slug} row={p} />
        ))}
      </div>
      <CreatePresaveForm slug={slug} />
    </section>
  );
}

const inputCls = "rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white";

function PresaveRow({ slug, row }: { slug: string; row: PresaveAdminRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({ onSuccess: () => router.refresh() });

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessError(null);
    const fd = new FormData(e.currentTarget);
    const result = await submit(updatePresaveAction, fd);
    if (result && "success" in result) setEditing(false);
    else if (result && "error" in result) setBusinessError(result.error);
  }

  async function handleToggle() {
    setBusinessError(null);
    const fd = new FormData();
    fd.set("artist_slug", slug);
    fd.set("action_id", row.id);
    fd.set("active", row.active ? "false" : "true");
    const result = await submit(togglePresaveActiveAction, fd);
    if (result && "error" in result) setBusinessError(result.error);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      {!editing ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              🎵 {row.title}
              {!row.active && (
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase text-white/50">
                  Paused
                </span>
              )}
              {row.active && !row.live && (
                <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs uppercase text-amber-200">
                  Expired
                </span>
              )}
              {row.live && (
                <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs uppercase text-emerald-200">
                  Live
                </span>
              )}
            </p>
            <p className="text-xs text-white/60">
              +{row.point_value} pts · release {row.release_date ?? "—"} · {row.completions} click-through
              {row.completions === 1 ? "" : "s"}
            </p>
            {row.url && <p className="mt-1 truncate text-xs text-white/50">{row.url}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              ✏️ Edit
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={submitting}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              {row.active ? "Pause" : "Resume"}
            </button>
            <SaveStatusIndicator status={status} />
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="grid gap-2 md:grid-cols-2">
          <input type="hidden" name="artist_slug" value={slug} />
          <input type="hidden" name="action_id" value={row.id} />
          <input name="title" required defaultValue={row.title} placeholder="Song / album title" className={inputCls} />
          <input name="url" required defaultValue={row.url ?? ""} placeholder="https://… (Spotify / Apple / linkfire)" className={inputCls} />
          <input name="release_date" type="date" defaultValue={row.release_date ?? ""} className={inputCls} />
          <input name="points" type="number" min={1} max={500} defaultValue={row.point_value} placeholder="Points" className={inputCls} />
          <input name="description" defaultValue={row.description ?? ""} placeholder="One line for the card (optional)" className={`${inputCls} md:col-span-2`} />
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" name="active" value="true" defaultChecked={row.active} />
            Active
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
            <SaveStatusIndicator status={status} />
          </div>
        </form>
      )}
      {businessError && <p className="mt-2 text-xs text-rose-300">✗ {businessError}</p>}
    </div>
  );
}

function CreatePresaveForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({ onSuccess: () => router.refresh() });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessError(null);
    const form = e.currentTarget;
    const result = await submit(createPresaveAction, new FormData(form));
    if (result && "success" in result) form.reset();
    else if (result && "error" in result) setBusinessError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-2 md:grid-cols-2">
      <input type="hidden" name="artist_slug" value={slug} />
      <input name="title" required placeholder="Song / album title" className={inputCls} />
      <input name="url" required placeholder="https://… (Spotify / Apple / linkfire)" className={inputCls} />
      <label className="text-xs text-white/70">
        Release date
        <input name="release_date" type="date" className={`${inputCls} mt-1 w-full`} />
      </label>
      <label className="text-xs text-white/70">
        Points per fan
        <input name="points" type="number" min={1} max={500} defaultValue={PRESAVE_DEFAULT_POINTS} className={`${inputCls} mt-1 w-full`} />
      </label>
      <input name="description" placeholder="One line for the card (optional)" className={`${inputCls} md:col-span-2`} />
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "+ Add pre-save"}
        </button>
        <SaveStatusIndicator status={status} />
        {businessError && <span className="text-xs text-rose-300">✗ {businessError}</span>}
      </div>
    </form>
  );
}

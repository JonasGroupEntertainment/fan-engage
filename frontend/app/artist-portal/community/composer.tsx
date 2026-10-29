"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import ImageUploader from "@/components/image-uploader";
import VideoUploader from "@/components/video-uploader";
import AltTextSuggester from "@/components/community/alt-text-suggester";
import TagSuggester from "@/components/community/tag-suggester";
import CaptionSuggester from "@/app/artists/[slug]/community/caption-suggester";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import {
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  type PostKind,
} from "@/lib/community/post-input";
import { createPortalPostAction, discardPortalDraftAction } from "./actions";

type Visibility = "public" | "premium" | "founder-only";

export interface PortalDraft {
  id: string;
  kind: string;
  suggested_title: string | null;
  suggested_body: string;
  context_summary: string | null;
  created_at: string;
}

const KIND_LABELS: Record<PostKind, string> = {
  post: "Post",
  announcement: "📢 Announcement",
  poll: "📊 Poll",
  challenge: "🏆 Challenge",
};

const VISIBILITY_LABELS: Record<Visibility, { label: string; title: string }> = {
  public: { label: "🌐 Public", title: "Visible to everyone" },
  premium: { label: "⭐ Premium", title: "Visible only to Premium fans" },
  "founder-only": { label: "👑 Founders", title: "Visible only to Founders" },
};

/** `datetime-local` wants "YYYY-MM-DDTHH:MM" in the browser's local zone. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Artist-portal composer. Same kinds, media, AI helpers and visibility
 * options as the fan composer (app/artists/[slug]/community/new-post-form.tsx)
 * — every author here is a team author, so the controls are always on —
 * plus "Schedule for" and the AI "Drafts for you" panel.
 */
export default function PortalComposer({
  artistSlug,
  drafts,
  showAdminDraftsLink,
}: {
  artistSlug: string;
  drafts: PortalDraft[];
  showAdminDraftsLink: boolean;
}) {
  const [kind, setKind] = useState<PostKind>("post");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [captionUsed, setCaptionUsed] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { status, invoke, submitting } = useFormSave();
  const [discarding, startDiscard] = useTransition();
  const [hiddenDrafts, setHiddenDrafts] = useState<Set<string>>(new Set());

  // Earliest pickable slot; refreshed when scheduling is switched on so the
  // clock is only read inside an event handler, never during render.
  const [minSchedule, setMinSchedule] = useState("");

  const visibleDrafts = drafts.filter((d) => !hiddenDrafts.has(d.id));

  function resetForm() {
    formRef.current?.reset();
    setKind("post");
    setVisibility("public");
    setTitle("");
    setBody("");
    setPollOptions(["", ""]);
    setScheduleOn(false);
    setScheduleLocal("");
    setMinSchedule("");
    setImageUrl(null);
    setCaptionUsed(false);
    setDraftId(null);
    setUploaderKey((k) => k + 1);
  }

  function applyDraft(d: PortalDraft) {
    setKind(d.kind === "announcement" ? "announcement" : "post");
    setTitle(d.suggested_title ?? "");
    setBody(d.suggested_body);
    setDraftId(d.id);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function discardDraft(d: PortalDraft) {
    const fd = new FormData();
    fd.set("draft_id", d.id);
    startDiscard(async () => {
      await discardPortalDraftAction(fd);
      setHiddenDrafts((s) => new Set(s).add(d.id));
      if (draftId === d.id) setDraftId(null);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("kind", kind);
    formData.set("visibility", visibility);
    if (draftId) formData.set("draft_id", draftId);

    // Browser-local datetime → ISO. Server re-validates (future only).
    formData.delete("scheduled_for");
    if (scheduleOn && scheduleLocal) {
      const ms = Date.parse(scheduleLocal);
      if (Number.isFinite(ms)) formData.set("scheduled_for", new Date(ms).toISOString());
    }

    formData.delete("option");
    if (kind === "poll") {
      for (const opt of pollOptions) {
        const v = opt.trim();
        if (v) formData.append("option", v);
      }
    }

    setLastResult(null);
    const ok = await invoke(async () => {
      const res = await createPortalPostAction(formData);
      if (!res.ok) throw new Error(res.error);
      setLastResult(
        res.scheduledFor
          ? `Scheduled for ${new Date(res.scheduledFor).toLocaleString()}.`
          : "Published to the community.",
      );
      return { ok: true };
    });
    if (ok) resetForm();
  }

  const filledOptions = pollOptions.filter((o) => o.trim()).length;
  const submitLabel = scheduleOn && scheduleLocal
    ? "Schedule"
    : kind === "poll"
      ? "Publish poll"
      : kind === "announcement"
        ? "Publish announcement"
        : kind === "challenge"
          ? "Publish challenge"
          : "Publish post";

  return (
    <div className="space-y-6">
      {/* AI drafts for you */}
      {visibleDrafts.length > 0 && (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/80">
              Drafts for you
            </h2>
            {showAdminDraftsLink && (
              <Link href="/admin/post-drafts" className="text-xs text-white/50 hover:text-white">
                Manage in admin →
              </Link>
            )}
          </div>
          <p className="text-xs text-white/50">
            AI-written from your upcoming events and recent activity. Use one as a starting point
            or discard it.
          </p>
          <ul className="space-y-3">
            {visibleDrafts.map((d) => (
              <li key={d.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-white/40">
                      {d.kind} · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                    {d.suggested_title && (
                      <p className="mt-1 text-sm font-semibold text-white">{d.suggested_title}</p>
                    )}
                    <p className="mt-1 whitespace-pre-line text-sm text-white/75">{d.suggested_body}</p>
                    {d.context_summary && (
                      <p className="mt-2 text-xs italic text-white/40">{d.context_summary}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => applyDraft(d)}
                      className="rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
                    >
                      Use this draft
                    </button>
                    <button
                      type="button"
                      disabled={discarding}
                      onClick={() => discardDraft(d)}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50 hover:text-rose-300 disabled:opacity-50"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Composer */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            New post
          </h2>
          {draftId && (
            <span className="text-xs text-amber-200/80">
              From an AI draft ·{" "}
              <button type="button" onClick={() => setDraftId(null)} className="underline">
                detach
              </button>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(KIND_LABELS) as PostKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                kind === k
                  ? "border-purple-400/60 bg-purple-500/20 text-white"
                  : "border-white/10 bg-black/30 text-white/70 hover:bg-black/50"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/30 p-0.5">
            {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                title={VISIBILITY_LABELS[v].title}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  visibility === v
                    ? "border border-amber-300/70 bg-white/10 text-white"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                {VISIBILITY_LABELS[v].label}
              </button>
            ))}
          </div>
        </div>

        {(kind === "announcement" || kind === "challenge") && (
          <input
            type="text"
            name="title"
            maxLength={POST_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "announcement" ? "Announcement headline (optional)" : "Challenge title (optional)"
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        )}

        <textarea
          name="body"
          required
          maxLength={POST_BODY_MAX}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            kind === "poll"
              ? "Ask a question… e.g. Which song should we play next?"
              : kind === "challenge"
                ? "Describe the challenge and what fans should submit…"
                : kind === "announcement"
                  ? "Share an announcement with the community…"
                  : "What do you want to tell your fans?"
          }
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
        />
        <input type="hidden" name="caption_used" value={captionUsed ? "1" : "0"} />

        <TagSuggester partialBody={body} artistSlug={artistSlug} />

        {kind === "poll" && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-white/50">Options</p>
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[i] = e.target.value;
                    setPollOptions(next);
                  }}
                  maxLength={120}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none"
                />
                {pollOptions.length > POLL_OPTIONS_MIN && (
                  <button
                    type="button"
                    onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                    className="min-h-11 px-2 text-xs text-rose-300/80 hover:text-rose-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < POLL_OPTIONS_MAX && (
              <button
                type="button"
                onClick={() => setPollOptions([...pollOptions, ""])}
                className="text-xs text-white/60 hover:text-white"
              >
                + Add option
              </button>
            )}
          </div>
        )}

        {kind !== "poll" && (
          <>
            <ImageUploader
              key={uploaderKey}
              bucket="community-uploads"
              name="image_url"
              label={kind === "challenge" ? "Add cover photo" : "Add photo"}
              onUploaded={(url) => {
                setImageUrl(url);
                setCaptionUsed(false);
              }}
            />
            {imageUrl && (
              <CaptionSuggester
                imageUrl={imageUrl}
                partialBody={body}
                artistSlug={artistSlug}
                onPick={(caption) =>
                  setBody((prev) =>
                    prev.trim().length === 0 ? caption : `${prev.replace(/\s+$/, "")} ${caption}`,
                  )
                }
                onUsedChange={setCaptionUsed}
              />
            )}
            {imageUrl && (
              <AltTextSuggester imageUrl={imageUrl} artistSlug={artistSlug} partialBody={body} />
            )}
          </>
        )}

        {(kind === "post" || kind === "announcement") && (
          <VideoUploader key={uploaderKey} label="Attach video (optional)" />
        )}

        {/* Schedule for — team authors only (this whole surface is editor+) */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={scheduleOn}
              onChange={(e) => {
                setScheduleOn(e.target.checked);
                if (e.target.checked) {
                  const min = toLocalInputValue(new Date(Date.now() + 5 * 60_000));
                  setMinSchedule(min);
                  if (!scheduleLocal) setScheduleLocal(min);
                }
              }}
            />
            Schedule for later
          </label>
          {scheduleOn && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="datetime-local"
                value={scheduleLocal}
                min={minSchedule}
                onChange={(e) => setScheduleLocal(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white focus:outline-none"
              />
              <span className="text-xs text-white/40">
                Your local time. Fans see it and get the push once that moment arrives (within 5 minutes).
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/50">
            {kind === "poll" ? `${filledOptions} of ${POLL_OPTIONS_MAX} options` : lastResult ?? ""}
          </span>
          <div className="flex items-center gap-3">
            <SaveStatusIndicator status={status} />
            <button
              type="submit"
              disabled={
                submitting ||
                (kind === "poll" && filledOptions < POLL_OPTIONS_MIN) ||
                (scheduleOn && !scheduleLocal)
              }
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

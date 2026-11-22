"use client";

import { useRef, useState } from "react";
import ImageUploader from "@/components/image-uploader";
import { pushPointsToast } from "@/components/points-toast";
import VideoUploader from "@/components/video-uploader";
import CaptionSuggester from "./caption-suggester";
import AltTextSuggester from "@/components/community/alt-text-suggester";
import TagSuggester from "@/components/community/tag-suggester";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import {
  ALSO_POST_FIELD,
  ALSO_POST_VALUE,
  SOCIAL_AGE_21_FORM_NOTE,
  SOCIAL_NO_PHOTO_FORM_NOTE,
  SUBMIT_KEY_FIELD,
  alsoPostLabel,
  isAge21Content,
  type SocialPlatform,
} from "@/lib/social/social-post";
import {
  createAnnouncementAction,
  createChallengeAction,
  createPollAction,
  createPostAction,
} from "./actions";

type Kind = "post" | "announcement" | "poll" | "challenge";
type Visibility = "public" | "premium" | "founder-only";

export default function NewPostForm({
  artistSlug,
  artistName,
  isAdmin,
  socialPlatforms = [],
}: {
  artistSlug: string;
  artistName: string;
  isAdmin: boolean;
  /** Linked social platforms this team member may also post an announcement to. */
  socialPlatforms?: SocialPlatform[];
}) {
  const [kind, setKind] = useState<Kind>("post");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [visibility, setVisibility] = useState<Visibility>("public");
  // Bump this key to force-remount the ImageUploader after a submit (which
  // clears its internal state + hidden input).
  const [uploaderKey, setUploaderKey] = useState(0);
  // Phase 12: caption suggester state — image url comes from the
  // ImageUploader.onUploaded callback so the suggester can fetch it,
  // body is mirrored so we can append the picked caption, captionUsed
  // flips when fan picks a suggestion (rides with the form).
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [body, setBody] = useState<string>("");
  const [captionUsed, setCaptionUsed] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [alsoPostToSocial, setAlsoPostToSocial] = useState(false);
  // What happened on social after the last announcement, shown under the form.
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { status, invoke, submitting } = useFormSave();

  function resetForm() {
    formRef.current?.reset();
    setPollOptions(["", ""]);
    setVisibility("public");
    setUploaderKey((k) => k + 1);
    setImageUrl(null);
    setBody("");
    setCaptionUsed(false);
    setTitle("");
    setAlsoPostToSocial(false);
  }

  // Only a public team announcement can go to social, and never one that
  // mentions alcohol or tobacco. The server checks all of this again.
  const canOfferSocial =
    isAdmin && kind === "announcement" && visibility === "public" && socialPlatforms.length > 0;
  const isAge21 = canOfferSocial && isAge21Content(title, body);
  const showSocialCheckbox = canOfferSocial && !isAge21;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Team authors (admin_users grant) can flag any kind — including a plain
    // post — public, premium, or founder-only. Fans never see the control and
    // the server actions ignore the field unless the author holds a grant
    // (lib/founder-gate/core.ts resolveAuthorVisibility).
    if (isAdmin) {
      formData.set("visibility", visibility);
    }

    if (kind === "poll") {
      // Replace generic option[] entries with our state-tracked ones so admins
      // can add/remove option inputs dynamically.
      formData.delete("option");
      for (const opt of pollOptions) {
        const v = opt.trim();
        if (v) formData.append("option", v);
      }
    }

    const action =
      kind === "poll"
        ? createPollAction
        : kind === "announcement"
          ? createAnnouncementAction
          : kind === "challenge"
            ? createChallengeAction
            : createPostAction;

    // useFormSave wraps the call with retry-on-503 + visible status. If all
    // retries fail the status will be { kind: "error" } and we leave the
    // form populated so the user can fix and resubmit.
    // The checkbox is controlled here, so the field is set from state and
    // only when the box was on screen and ticked.
    formData.delete(ALSO_POST_FIELD);
    formData.delete(SUBMIT_KEY_FIELD);
    if (showSocialCheckbox && alsoPostToSocial) {
      formData.set(ALSO_POST_FIELD, ALSO_POST_VALUE);
      // One fresh key per submit. A retry of this submit reuses this same
      // form data, so the server can tell it has already sent to social.
      formData.set(SUBMIT_KEY_FIELD, crypto.randomUUID());
    }

    setSocialNotice(null);
    const ok = await invoke(async () => {
      const result = (await action(formData)) ?? undefined;
      // An announcement that was also sent to social resolves to
      // { socialNotice }. Fan posts resolve to { pointsAwarded, … } and the
      // other admin kinds to undefined; those feed the "+5 pts · N to Gold"
      // toast as before.
      if (result && "socialNotice" in result) return { ok: true, socialNotice: result.socialNotice };
      pushPointsToast(result);
      return { ok: true, socialNotice: null };
    });
    if (ok) {
      setSocialNotice(ok.socialNotice);
      resetForm();
      setKind("post");
    }
  }

  const submitLabel =
    kind === "poll"
      ? "Publish poll"
      : kind === "announcement"
        ? "Publish announcement"
        : kind === "challenge"
          ? "Publish challenge"
          : "Post · +5 pts";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="glass-card space-y-3 p-5"
    >
      <input type="hidden" name="artist_slug" value={artistSlug} />

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {(["post", "announcement", "poll", "challenge"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
                kind === k
                  ? "border-aurora/60 bg-aurora/20 text-white"
                  : "border-white/10 bg-black/30 text-white/70 hover:bg-black/50"
              }`}
            >
              {k === "post"
                ? "Post"
                : k === "announcement"
                  ? "📢 Announcement"
                  : k === "poll"
                    ? "📊 Poll"
                    : "🏆 Challenge"}
            </button>
          ))}
          {(
            <div className="ml-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/30 p-0.5">
              {(["public", "premium", "founder-only"] as Visibility[]).map((v) => {
                const isActive = visibility === v;
                const labels: Record<Visibility, string> = {
                  public: "🌐 Public",
                  premium: "⭐ Premium",
                  "founder-only": "👑 Founders",
                };
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    title={
                      v === "public"
                        ? "Visible to everyone"
                        : v === "premium"
                          ? "Visible only to Premium fans"
                          : "Visible only to Founders"
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                      isActive
                        ? v === "premium"
                          ? "border border-amber-300/70 bg-gradient-to-r from-aurora/30 to-ember/30 text-white"
                          : v === "founder-only"
                            ? "border border-amber-300/70 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-white"
                            : "border border-cyan-300/70 bg-gradient-to-r from-aurora/30 to-cyan-500/30 text-white"
                        : "text-white/60 hover:text-white/80"
                    }`}
                  >
                    {labels[v]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(kind === "announcement" || kind === "challenge") && (
        <input
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder={
            kind === "announcement"
              ? "Announcement headline (optional)"
              : "Challenge title (optional)"
          }
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
        />
      )}

      <textarea
        name="body"
        required
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          kind === "poll"
            ? "Ask a question… e.g. Which song should we play next?"
            : kind === "challenge"
              ? "Describe the challenge and what fans should submit…"
              : kind === "announcement"
                ? "Share an announcement with the community…"
                : "What's on your mind? Share with the community…"
        }
        rows={3}
        className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
      />
      <input type="hidden" name="caption_used" value={captionUsed ? "1" : "0"} />

      {/* AI #5 — TagSuggester (lights M-2 filter chips on submit) */}
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
                className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
              />
              {pollOptions.length > 2 && (
                <button
                  type="button"
                  onClick={() =>
                    setPollOptions(pollOptions.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-rose-300/80 hover:text-rose-300"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
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
              // A fresh upload resets the suggested-caption flag —
              // any earlier pick was for a different photo.
              setCaptionUsed(false);
            }}
          />
          {/* Phase 12: caption suggester — only renders when an image is uploaded. */}
          {imageUrl && (
            <CaptionSuggester
              imageUrl={imageUrl}
              partialBody={body}
              artistSlug={artistSlug}
              onPick={(caption) => {
                // Append (don't replace) so a fan who's already typing
                // doesn't lose their thought. If body is empty, just set.
                setBody((prev) =>
                  prev.trim().length === 0
                    ? caption
                    : `${prev.replace(/\s+$/, "")} ${caption}`,
                );
              }}
              onUsedChange={setCaptionUsed}
            />
          )}
          {/* AI alt-text — auto-fires on upload, fan can edit */}
          {imageUrl && (
            <AltTextSuggester
              imageUrl={imageUrl}
              artistSlug={artistSlug}
              partialBody={body}
            />
          )}
        </>
      )}

      {(kind === "post" || kind === "announcement") && (
        <VideoUploader key={uploaderKey} label="Attach video (optional)" />
      )}

      {showSocialCheckbox && (
        <div className="space-y-1">
          <label className="flex items-start gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={alsoPostToSocial}
              onChange={(e) => setAlsoPostToSocial(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/30"
            />
            <span>{alsoPostLabel(artistName, socialPlatforms)}</span>
          </label>
          {alsoPostToSocial && socialPlatforms.includes("instagram") && !imageUrl && (
            <p className="pl-6 text-xs text-white/60">{SOCIAL_NO_PHOTO_FORM_NOTE}</p>
          )}
        </div>
      )}

      {isAge21 && <p className="text-xs text-white/60">{SOCIAL_AGE_21_FORM_NOTE}</p>}

      {socialNotice && (
        <p role="status" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/80">
          {socialNotice}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {kind === "poll" ? (
          <span className="text-xs text-white/50">
            {pollOptions.filter((o) => o.trim()).length} of 6 options
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <SaveStatusIndicator status={status} />
          <button
            type="submit"
            disabled={
              submitting ||
              (kind === "poll" && pollOptions.filter((o) => o.trim()).length < 2)
            }
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "Posting…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

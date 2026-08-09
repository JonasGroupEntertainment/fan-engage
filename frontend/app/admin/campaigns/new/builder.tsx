"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { createAndPublishCampaign } from "../actions";

type Artist = { slug: string; name: string };
type CTAKind = "pre_save" | "stream" | "share" | "radio_request" | "playlist_add" | "social_follow" | "custom";

type CTA = {
  kind: CTAKind;
  title: string;
  description: string;
  url: string;
  cta_label: string;
  point_value: number;
};

const CTA_KIND_LABELS: Record<CTAKind, string> = {
  pre_save: "🎵 Pre-save (DSP)",
  stream: "▶️ Stream",
  share: "🔁 Share",
  radio_request: "📻 Radio request",
  playlist_add: "➕ Playlist add",
  social_follow: "👥 Social follow",
  custom: "✨ Custom action",
};

const DEFAULT_CTA_BY_KIND: Record<CTAKind, Partial<CTA>> = {
  pre_save: { cta_label: "Pre-save on Spotify", point_value: 50 },
  stream: { cta_label: "Stream now", point_value: 25 },
  share: { cta_label: "Share link", point_value: 15 },
  radio_request: { cta_label: "Request on radio", point_value: 30 },
  playlist_add: { cta_label: "Add to playlist", point_value: 20 },
  social_follow: { cta_label: "Follow", point_value: 20 },
  custom: { cta_label: "Complete", point_value: 25 },
};

export default function CampaignBuilder({ artists }: { artists: Artist[] }) {
  const [artistSlug, setArtistSlug] = useState(artists[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Optional sections
  const [includeAnnouncement, setIncludeAnnouncement] = useState(true);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");

  const [includePoll, setIncludePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  const [includeChallenge, setIncludeChallenge] = useState(false);
  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengeBody, setChallengeBody] = useState("");

  const [includeOffer, setIncludeOffer] = useState(false);
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerPricePoints, setOfferPricePoints] = useState("1000");
  const [offerCategory, setOfferCategory] = useState("merch");
  const [offerMinTier, setOfferMinTier] = useState("bronze");

  const [ctas, setCtas] = useState<CTA[]>([]);

  const [includeEvent, setIncludeEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDetail, setEventDetail] = useState("");
  const [eventDateText, setEventDateText] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [eventCapacity, setEventCapacity] = useState("");
  const [targetEventRsvpers, setTargetEventRsvpers] = useState(false);

  const [includeEmail, setIncludeEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [includeSms, setIncludeSms] = useState(false);
  const [smsBody, setSmsBody] = useState("");

  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave();

  function addCTA(kind: CTAKind) {
    const defaults = DEFAULT_CTA_BY_KIND[kind];
    setCtas([
      ...ctas,
      {
        kind,
        title: "",
        description: "",
        url: "",
        cta_label: defaults.cta_label ?? "Complete",
        point_value: defaults.point_value ?? 25,
      },
    ]);
  }

  function updateCTA(i: number, patch: Partial<CTA>) {
    setCtas(ctas.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function removeCTA(i: number) {
    setCtas(ctas.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(formData: FormData) {
    setBusinessError(null);
    if (!includeAnnouncement) formData.set("announcement_body", "");
    if (includePoll && pollQuestion.trim()) {
      formData.set(
        "poll_json",
        JSON.stringify({
          question: pollQuestion,
          options: pollOptions.filter((o) => o.trim()),
        }),
      );
    }
    if (!includeChallenge) formData.set("challenge_body", "");
    if (!includeOffer) formData.set("offer_title", "");
    if (ctas.length > 0) {
      formData.set("ctas_json", JSON.stringify(ctas.filter((c) => c.title.trim())));
    }
    if (!includeEvent) {
      formData.set("event_title", "");
      formData.set("target_event_rsvpers", "false");
    } else {
      formData.set("target_event_rsvpers", String(targetEventRsvpers));
    }
    if (!includeEmail) {
      formData.set("email_subject", "");
      formData.set("email_body", "");
    }
    if (!includeSms) formData.set("sms_body", "");
    const result = await submit(createAndPublishCampaign, formData);
    if (result?.success) {
      router.push("/admin/campaigns");
    } else if (result && !result.success) {
      setBusinessError(result.error);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <input type="hidden" name="artist_slug" value={artistSlug} />

      {/* Base */}
      <section className="glass-card space-y-3 p-5">
        <p className="text-sm font-semibold">Campaign basics</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/60">Artist</span>
            <select
              value={artistSlug}
              onChange={(e) => setArtistSlug(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
            >
              {artists.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/60">Campaign title</span>
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Album Launch Week"
              className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/60">Internal description</span>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="For your own tracking — not shown to fans."
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </label>
      </section>

      {/* Announcement */}
      <Section
        title="📢 Announcement"
        include={includeAnnouncement}
        onToggle={setIncludeAnnouncement}
      >
        <input
          name="announcement_title"
          value={announcementTitle}
          onChange={(e) => setAnnouncementTitle(e.target.value)}
          placeholder="Headline (defaults to campaign title)"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <textarea
          name="announcement_body"
          value={announcementBody}
          onChange={(e) => setAnnouncementBody(e.target.value)}
          rows={3}
          placeholder="Body copy — what's happening and why fans should care."
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
      </Section>

      {/* Poll */}
      <Section title="📊 Poll" include={includePoll} onToggle={setIncludePoll}>
        <input
          value={pollQuestion}
          onChange={(e) => setPollQuestion(e.target.value)}
          placeholder="Question (e.g. Which track should be the first single?)"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-white/50">Options</p>
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  setPollOptions(next);
                }}
                placeholder={`Option ${i + 1}`}
                className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
              />
              {pollOptions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
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
      </Section>

      {/* Challenge */}
      <Section
        title="🏆 Challenge"
        include={includeChallenge}
        onToggle={setIncludeChallenge}
      >
        <input
          name="challenge_title"
          value={challengeTitle}
          onChange={(e) => setChallengeTitle(e.target.value)}
          placeholder="Challenge title"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <textarea
          name="challenge_body"
          value={challengeBody}
          onChange={(e) => setChallengeBody(e.target.value)}
          rows={3}
          placeholder="What should fans submit? How will winners be chosen?"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
      </Section>

      {/* Offer */}
      <Section
        title="🛍️ Marketplace offer"
        include={includeOffer}
        onToggle={setIncludeOffer}
      >
        <div className="grid gap-2 md:grid-cols-2">
          <input
            name="offer_title"
            value={offerTitle}
            onChange={(e) => setOfferTitle(e.target.value)}
            placeholder="Offer title"
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
          <input
            name="offer_price_points"
            value={offerPricePoints}
            onChange={(e) => setOfferPricePoints(e.target.value)}
            placeholder="Price in points"
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
          <select
            name="offer_category"
            value={offerCategory}
            onChange={(e) => setOfferCategory(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          >
            <option value="merch">Merch</option>
            <option value="experience">Experience</option>
            <option value="collectible">Collectible</option>
            <option value="digital">Digital</option>
            <option value="ticket">Ticket</option>
          </select>
          <select
            name="offer_min_tier"
            value={offerMinTier}
            onChange={(e) => setOfferMinTier(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          >
            <option value="bronze">Bronze+</option>
            <option value="silver">Silver+</option>
            <option value="gold">Gold+</option>
            <option value="platinum">Platinum only</option>
          </select>
        </div>
        <textarea
          name="offer_description"
          value={offerDescription}
          onChange={(e) => setOfferDescription(e.target.value)}
          rows={2}
          placeholder="Describe what fans get."
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
      </Section>

      {/* CTAs */}
      <section className="glass-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">🎯 Fan CTAs (pre-saves, streams, shares, radio, etc.)</p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CTA_KIND_LABELS) as CTAKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => addCTA(k)}
                className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                + {CTA_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        {ctas.length === 0 ? (
          <p className="text-xs text-white/50">
            No CTAs yet. Add one or more to reward fans for taking action.
          </p>
        ) : (
          <div className="space-y-3">
            {ctas.map((c, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-purple-200">
                    {CTA_KIND_LABELS[c.kind]}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCTA(i)}
                    className="text-xs text-rose-300/80 hover:text-rose-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={c.title}
                    onChange={(e) => updateCTA(i, { title: e.target.value })}
                    placeholder="Title (e.g. Pre-save new single)"
                    className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={c.url}
                    onChange={(e) => updateCTA(i, { url: e.target.value })}
                    placeholder="URL (Spotify, station link, share target…)"
                    className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={c.cta_label}
                    onChange={(e) => updateCTA(i, { cta_label: e.target.value })}
                    placeholder="Button label"
                    className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={c.point_value}
                    onChange={(e) => updateCTA(i, { point_value: parseInt(e.target.value || "0", 10) })}
                    placeholder="Points on completion"
                    className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={c.description}
                    onChange={(e) => updateCTA(i, { description: e.target.value })}
                    rows={2}
                    placeholder="Short description shown to fans"
                    className="md:col-span-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Event */}
      <Section title="🎫 Event" include={includeEvent} onToggle={setIncludeEvent}>
        <input
          name="event_title"
          value={eventTitle}
          onChange={(e) => setEventTitle(e.target.value)}
          placeholder="Event title (e.g. Nashville Listening Party)"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <div className="grid gap-2 md:grid-cols-2">
          <input
            name="event_starts_at"
            type="datetime-local"
            value={eventStartsAt}
            onChange={(e) => setEventStartsAt(e.target.value)}
            placeholder="Start date/time"
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
          <input
            name="event_date_text"
            value={eventDateText}
            onChange={(e) => setEventDateText(e.target.value)}
            placeholder="Display date (e.g. Mar 14 · 7 PM)"
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
          <input
            name="event_location"
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            placeholder="Location (e.g. Nashville, TN)"
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
          <input
            name="event_capacity"
            type="number"
            value={eventCapacity}
            onChange={(e) => setEventCapacity(e.target.value)}
            placeholder="Capacity (blank = unlimited)"
            className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />
        </div>
        <input
          name="event_url"
          value={eventUrl}
          onChange={(e) => setEventUrl(e.target.value)}
          placeholder="URL (ticket link, livestream, etc.)"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <textarea
          name="event_detail"
          value={eventDetail}
          onChange={(e) => setEventDetail(e.target.value)}
          rows={2}
          placeholder="Detail shown on the event card"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            name="target_event_rsvpers"
            value="true"
            checked={targetEventRsvpers}
            onChange={(e) => setTargetEventRsvpers(e.target.checked)}
            className="h-4 w-4 accent-aurora"
          />
          Target SMS blast at event RSVPers (instead of all artist followers)
        </label>
      </Section>

      {/* Email */}
      <Section title="✉️ Email blast" include={includeEmail} onToggle={setIncludeEmail}>
        <input
          name="email_subject"
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          placeholder="Subject line"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <textarea
          name="email_body"
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          rows={4}
          placeholder="Email body"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <p className="text-xs text-white/50">
          Recorded as a campaign item; final send handled via Mailchimp.
        </p>
      </Section>

      {/* SMS */}
      <Section title="💬 SMS blast" include={includeSms} onToggle={setIncludeSms}>
        <textarea
          name="sms_body"
          value={smsBody}
          onChange={(e) => setSmsBody(e.target.value)}
          rows={2}
          maxLength={160}
          placeholder="Short SMS (160 char max)"
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        />
        <p className="text-xs text-white/50">
          Recorded as a campaign item; sends via Twilio to opted-in fans.
        </p>
      </Section>

      <div className="flex items-center justify-end gap-3 py-4">
        <a
          href="/admin/campaigns"
          className="text-sm text-white/60 hover:text-white"
        >
          Cancel
        </a>
        <SaveStatusIndicator status={status} />
        {businessError && (
          <span role="alert" className="text-xs text-rose-300">
            ✗ {businessError}
          </span>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim() || !artistSlug}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-2 text-sm font-semibold text-white shadow-glass hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? "Publishing…" : "Publish campaign"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  include,
  onToggle,
  children,
}: {
  title: string;
  include: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card p-5">
      <header className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-aurora"
          />
          Include
        </label>
      </header>
      {include && <div className="mt-3 space-y-2">{children}</div>}
    </section>
  );
}

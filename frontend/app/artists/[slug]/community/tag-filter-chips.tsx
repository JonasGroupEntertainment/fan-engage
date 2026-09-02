"use client";

/**
 * Tag filter chips for the /artists/[slug]/community feed.
 *
 * Server component owns data — passes `tags` (top-N for this artist
 * with post counts) + `activeTag` (current ?tag= URL param). This
 * client component renders the chip row + handles router push on
 * click.
 *
 * The "All" chip clears the filter; others push ?tag=<slug>.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  filterCommunityTagsForMarketplace,
  isMarketplaceLive,
} from "@/lib/marketplace-live";

interface TagOption {
  tag: string;
  post_count: number;
}

interface Props {
  tags: TagOption[];
  /** Currently selected tag from the URL, or null for "all". */
  activeTag: string | null;
}

export default function TagFilterChips({ tags, activeTag }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const visibleTags = filterCommunityTagsForMarketplace(tags, isMarketplaceLive());

  if (visibleTags.length === 0) return null;

  function setTag(tag: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (tag) {
      params.set("tag", tag);
    } else {
      params.delete("tag");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div
      className="flex flex-wrap gap-2 pb-2"
      aria-label="Filter posts by tag"
      role="group"
    >
      <Chip
        label="All"
        active={activeTag === null}
        onClick={() => setTag(null)}
      />
      {visibleTags.map((t) => (
        <Chip
          key={t.tag}
          label={prettyTag(t.tag)}
          count={t.post_count}
          active={activeTag === t.tag}
          onClick={() => setTag(t.tag)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition";
  const cls = active
    ? "border-white/40 bg-white/15 text-white"
    : "border-white/10 bg-black/30 text-white/70 hover:border-white/30 hover:bg-black/50";
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-xs text-white/50">{count}</span>
      )}
    </button>
  );
}

/** Map snake_case canonical tags to display labels. Keep these in
 *  sync with CANONICAL_TAGS in lib/tagging/client.ts. */
function prettyTag(tag: string): string {
  const labels: Record<string, string> = {
    live_show: "Live Shows",
    tour_announcement: "Tour Announcements",
    setlist: "Setlists",
    tour_recap: "Tour Recaps",
    livestream: "Livestreams",
    studio_session: "Studio Sessions",
    behind_the_scenes: "Behind the Scenes",
    release: "Releases",
    lyrics: "Lyrics",
    collaboration: "Collabs",
    merch_drop: "Merch Drops",
    pre_order: "Pre-Orders",
    fan_question: "Fan Questions",
    fan_art: "Fan Art",
    celebration: "Celebrations",
    gratitude: "Gratitude",
    meme: "Memes",
    introduction: "Intros",
    personal_update: "Personal Updates",
    media_appearance: "Media",
    other: "Other",
  };
  return labels[tag] ?? tag.replace(/_/g, " ");
}

/**
 * In-portal launch checklist — pure. `lib/launch/data.ts` gathers the
 * counts from Supabase; this module turns them into checklist items so the
 * rules can be unit-tested without a database.
 *
 * `required` items gate "Ready to launch". `optional` items are nice-to-
 * haves the page shows but never blocks on. `info` items are informational
 * signals (push reach, founders) with no fix action the team can take
 * from the portal.
 */

export type ReadinessKind = "required" | "optional" | "info";

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** One line explaining the current state ("1 of 2 socials"). */
  detail: string;
  /** Where to go to fix it. */
  href: string;
  kind: ReadinessKind;
}

export interface ReadinessInput {
  /** artists.slug / communities.slug — used to build hrefs. */
  slug: string;
  profile: {
    name: string | null;
    tagline: string | null;
    bio: string | null;
    /** artists.hero_image or communities.hero_image. */
    heroImage: string | null;
    /** True when lib/artist-keyart.ts has a processed key-art file for the slug. */
    hasKeyArt: boolean;
    /** Count of entries in artists.social. */
    socialCount: number;
  };
  /** Active events whose day (starts_at / event_date) is today or later. */
  upcomingEvents: number;
  /** community_posts rows for the community. */
  posts: number;
  /** rewards_catalog rows with active = true. */
  activeRewards: number;
  /** fan_actions rows with kind = 'pre_save' and active = true. */
  activePreSaves: number;
  /** admin_users rows for the community (any role). */
  teamMembers: number;
  /** Distinct followers (fan_artist_following) with ≥1 push_subscriptions row. */
  pushSubscribedFollowers: number;
  /** communities.founder_cap > 0. */
  foundersEnabled: boolean;
  /** communities.founder_cap for the detail line. */
  founderCap: number;
}

export interface Readiness {
  items: ReadinessItem[];
  /** Required items done / total. */
  requiredDone: number;
  requiredTotal: number;
  /** 0–100, required items only. */
  percent: number;
  ready: boolean;
}

export const MIN_SOCIALS = 2;
export const MIN_POSTS = 3;
export const MIN_TEAM = 2;

/** Seed bios say "Placeholder bio — awaiting …"; treat those as missing. */
export function isPlaceholderText(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  if (t.length < 20) return true;
  return /\b(placeholder|lorem ipsum|coming soon|tbd|tba|awaiting)\b/i.test(t);
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const { slug, profile } = input;
  const portal = "/artist-portal";
  const adminArtist = `/admin/artists/${slug}`;

  const name = Boolean(profile.name?.trim());
  const tagline = Boolean(profile.tagline?.trim());
  const bio = !isPlaceholderText(profile.bio);
  const art = Boolean(profile.heroImage?.trim()) || profile.hasKeyArt;
  const missing = [
    !name && "name",
    !tagline && "tagline",
    !bio && "bio",
    !art && "hero image",
  ].filter(Boolean) as string[];

  const items: ReadinessItem[] = [
    {
      key: "profile",
      label: "Artist profile complete",
      done: missing.length === 0,
      detail:
        missing.length === 0
          ? "Name, tagline, bio and hero image are set"
          : `Missing: ${missing.join(", ")}`,
      href: adminArtist,
      kind: "required",
    },
    {
      key: "socials",
      label: `At least ${MIN_SOCIALS} social links`,
      done: profile.socialCount >= MIN_SOCIALS,
      detail: `${profile.socialCount} of ${MIN_SOCIALS} linked`,
      href: adminArtist,
      kind: "required",
    },
    {
      key: "event",
      label: "An upcoming event on the calendar",
      done: input.upcomingEvents >= 1,
      detail:
        input.upcomingEvents === 0
          ? "No upcoming events — add one or paste a tour list"
          : `${input.upcomingEvents} upcoming`,
      href: `${portal}/events`,
      kind: "required",
    },
    {
      key: "posts",
      label: `At least ${MIN_POSTS} community posts`,
      done: input.posts >= MIN_POSTS,
      detail: `${input.posts} of ${MIN_POSTS} posted`,
      href: `${portal}/community`,
      kind: "required",
    },
    {
      key: "reward",
      label: "An active reward fans can redeem",
      done: input.activeRewards >= 1,
      detail:
        input.activeRewards === 0 ? "No active rewards in the catalog" : `${input.activeRewards} active`,
      href: "/admin/rewards",
      kind: "required",
    },
    {
      key: "team",
      label: `At least ${MIN_TEAM} team members`,
      done: input.teamMembers >= MIN_TEAM,
      detail: `${input.teamMembers} of ${MIN_TEAM} on the team`,
      href: `${portal}/team`,
      kind: "required",
    },
    {
      key: "checkin",
      label: "Live check-in QR available",
      done: true,
      detail: "Ready whenever you are — open it at the show",
      href: `${portal}/checkin-qr`,
      kind: "required",
    },
    {
      key: "presave",
      label: "Pre-save configured",
      done: input.activePreSaves >= 1,
      detail:
        input.activePreSaves === 0
          ? "Optional — set one up when a release is coming"
          : `${input.activePreSaves} active`,
      href: "/admin/campaigns/new",
      kind: "optional",
    },
    {
      key: "push",
      label: "Push notifications reach followers",
      done: input.pushSubscribedFollowers >= 1,
      detail:
        input.pushSubscribedFollowers === 0
          ? "No followers have enabled push yet"
          : `${input.pushSubscribedFollowers} follower${input.pushSubscribedFollowers === 1 ? "" : "s"} subscribed`,
      href: "/admin/broadcast",
      kind: "info",
    },
    {
      key: "founders",
      label: "Founders program",
      done: input.foundersEnabled,
      detail: input.foundersEnabled
        ? `On — first ${input.founderCap} subscribers lock founder pricing`
        : "Off (founder cap is 0)",
      href: "/admin/founders",
      kind: "info",
    },
  ];

  const required = items.filter((i) => i.kind === "required");
  const requiredDone = required.filter((i) => i.done).length;
  const requiredTotal = required.length;
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100);
  return { items, requiredDone, requiredTotal, percent, ready: requiredDone === requiredTotal };
}

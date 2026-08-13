export type Artist = {
  slug: string;
  name: string;
  tagline: string;
  bio: string;
  heroImage: string | null; // fill when Box assets land
  /** Focal-point x coord 0..100; falls back to 50 when not set. */
  heroFocalX?: number;
  /** Focal-point y coord 0..100; falls back to 50 when not set. */
  heroFocalY?: number;
  accentFrom: string; // CSS color literal (e.g. "#f43f5e")
  accentTo: string; // CSS color literal (e.g. "#fbbf24")
  genres: string[];
  upcoming: {
    /** DB-backed event id. Optional for legacy hardcoded fallback entries. */
    id?: string;
    title: string;
    detail: string;
    date: string;
    capacity?: number | null;
    location?: string | null;
    url?: string | null;
    /**
     * Phase 5d: access tier for this event. DB events carry their row's
     * `tier` column ('public' | 'premium'); legacy hardcoded fallback
     * entries leave this undefined and are treated as public.
     */
    tier?: "public" | "premium";
  }[];
  merch: { title: string; tier: string; points: string }[];
  social: { label: string; href: string }[];
  /** External merch store URL shown as a CTA until in-app merch is live. */
  merchUrl?: string | null;
};

// Placeholder content for each artist — swap when Box assets are delivered.
// Keep keys stable; marketing can paste final copy here without touching layout.
export const ARTISTS: Record<string, Artist> = {
  raelynn: {
    slug: "raelynn",
    name: "RaeLynn",
    tagline: "Country, heart-first.",
    bio: "Placeholder bio — awaiting final copy from marketing.",
    heroImage: null,
    accentFrom: "#f43f5e",
    accentTo: "#fbbf24",
    genres: ["Country", "Americana"],
    upcoming: [
      { title: "Nashville Listening Party", detail: "Fan Engage members only", date: "Coming soon" },
    ],
    merch: [
      { title: "Phone Wallpaper Pack", tier: "Silver Priority", points: "3,200 pts" },
      { title: "Tour Hoodie", tier: "Bronze+", points: "2,400 pts" },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com/raelynn" }],
  },
  bailee: {
    slug: "bailee",
    name: "Bailee",
    tagline: "Rising voice, no ceiling.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#8b5cf6",
    accentTo: "#e879f9",
    genres: ["Pop"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Debut EP Bundle", tier: "Bronze+", points: "1,800 pts" }],
    social: [],
  },
  "bailee-madison": {
    slug: "bailee-madison",
    name: "Bailee Madison",
    tagline: "Actress. Artist. Unapologetically herself.",
    bio: 'Bailee Madison is a Fort Lauderdale–born, Nashville-raised actress and emerging music artist with over 20 years in the industry. Known for Bridge to Terabithia, Good Witch (Hallmark, 6 seasons), and Pretty Little Liars: Original Sin (HBO Max), Bailee made her music debut with the single "Kinda Fun" on Red Van Records in 2024. She is managed by Jonas Group Entertainment (music) and TFC Management (acting).',
    heroImage: null,
    heroFocalX: 50,
    heroFocalY: 35,
    accentFrom: "#8b5cf6",
    accentTo: "#e879f9",
    genres: ["Pop", "Indie Pop"],
    upcoming: [
      { title: "Roommates", detail: "Netflix Comedy Film — 2026", date: "Coming 2026" },
      { title: "40 Dates and 40 Nights", detail: "Film — Post-production", date: "TBD" },
    ],
    merch: [
      { title: '"Kinda Fun" Single Bundle', tier: "Bronze+", points: "1,800 pts" },
      { title: "Signed Photo Print", tier: "Silver+", points: "2,800 pts" },
    ],
    social: [
      { label: "Instagram", href: "https://www.instagram.com/baileemadison/" },
      { label: "Twitter / X", href: "https://twitter.com/BaileeMadison" },
    ],
  },
  blake: {
    slug: "blake",
    name: "Blake",
    tagline: "Studio-raw, stadium-ready.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#0ea5e9",
    accentTo: "#34d399",
    genres: ["Country", "Rock"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Tour Poster Set", tier: "Bronze+", points: "1,200 pts" }],
    social: [],
  },
  konnor: {
    slug: "konnor",
    name: "Konnor",
    tagline: "New-school songwriting.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#f59e0b",
    accentTo: "#fb923c",
    genres: ["Pop", "Indie"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Signed Lyric Print", tier: "Silver+", points: "2,800 pts" }],
    social: [],
  },
  dan: {
    slug: "dan",
    name: "Dan",
    tagline: "Heartland heart, modern punch.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#64748b",
    accentTo: "#60a5fa",
    genres: ["Country"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Tour Tee", tier: "Bronze+", points: "1,400 pts" }],
    social: [],
  },
  "danger-twins": {
    slug: "danger-twins",
    name: "Danger Twins",
    tagline: "Amy Stroup + Gabe Dixon. Two voices, one frequency.",
    bio: "Placeholder bio — awaiting final copy from marketing.",
    heroImage: null,
    accentFrom: "#ec4899",
    accentTo: "#a855f7",
    genres: ["Indie Pop", "Americana"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Signed Bundle", tier: "Bronze+", points: "1,800 pts" }],
    social: [],
  },
  "dan-marshall": {
    slug: "dan-marshall",
    name: "Dan Marshall",
    tagline: "Songwriter at the intersection of country and story.",
    bio: "Placeholder bio — awaiting final copy from marketing.",
    heroImage: null,
    accentFrom: "#64748b",
    accentTo: "#60a5fa",
    genres: ["Country", "Americana"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Tour Tee", tier: "Bronze+", points: "1,400 pts" }],
    social: [],
  },
  "hunter-hawkins": {
    slug: "hunter-hawkins",
    name: "Hunter Hawkins",
    tagline: "Rising voice. Real stories.",
    bio: "Placeholder bio — awaiting final copy from marketing.",
    heroImage: null,
    accentFrom: "#f59e0b",
    accentTo: "#ef4444",
    genres: ["Country"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Debut Bundle", tier: "Bronze+", points: "1,400 pts" }],
    social: [],
  },
};

export function getArtist(slug: string): Artist | null {
  return ARTISTS[slug.toLowerCase()] ?? null;
}

export function listArtists(): Artist[] {
  return Object.values(ARTISTS);
}

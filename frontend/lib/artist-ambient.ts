// Deterministic genre-bucket -> ambient background mapping for the
// Featured Artists grid. Falls back to "general" for unmatched genres
// or DB-sourced artists with no genre data.
const AMBIENT_BUCKETS = {
  country: "/images/artist-ambient/country.jpg",
  pop: "/images/artist-ambient/pop.jpg",
  indie: "/images/artist-ambient/indie.jpg",
  rock: "/images/artist-ambient/rock.jpg",
  general: "/images/artist-ambient/general.jpg",
} as const;

const GENRE_TO_BUCKET: Record<string, keyof typeof AMBIENT_BUCKETS> = {
  country: "country",
  americana: "country",
  pop: "pop",
  "indie pop": "indie",
  indie: "indie",
  rock: "rock",
};

export function getArtistAmbientImage(genres: string[] | undefined): string {
  for (const genre of genres ?? []) {
    const bucket = GENRE_TO_BUCKET[genre.toLowerCase()];
    if (bucket) return AMBIENT_BUCKETS[bucket];
  }
  return AMBIENT_BUCKETS.general;
}

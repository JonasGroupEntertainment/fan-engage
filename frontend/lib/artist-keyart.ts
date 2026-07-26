// Per-artist stage-lit key-art, color-graded from each artist's real hero
// photo using their own accent colors. Falls back to the genre-bucket
// ambient image for any artist without a processed key-art file yet.
import { getArtistAmbientImage } from "@/lib/artist-ambient";

const KEYART: Record<string, string> = {
  raelynn: "/images/artist-keyart/raelynn.jpg",
  "danger-twins": "/images/artist-keyart/danger-twins.jpg",
  "dan-marshall": "/images/artist-keyart/dan-marshall.jpg",
  "hunter-hawkins": "/images/artist-keyart/hunter-hawkins.jpg",
  "denise-jonas": "/images/artist-keyart/denise-jonas.jpg",
};

export function getArtistKeyArt(
  slug: string,
  genres: string[] | undefined,
): string {
  return KEYART[slug] ?? getArtistAmbientImage(genres);
}

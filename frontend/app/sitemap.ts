import type { MetadataRoute } from "next";
import { listArtistsFromDb } from "@/lib/data/artists";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";

// Dynamic sitemap — lists the public, crawlable surfaces of Fan Engage:
// marketing root, every active artist page, and the legal pages. We omit
// anything auth-gated (admin, /inbox) and anything that would require a
// session to be meaningful (rewards, marketplace, referrals).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    {
      url: `${appUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${appUrl}/artists`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${appUrl}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${appUrl}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${appUrl}/cookie-policy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${appUrl}/help`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  try {
    const artists = await listArtistsFromDb();
    for (const a of artists) {
      base.push({
        url: `${appUrl}/artists/${a.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // Silently skip artist pages if the DB fetch errors — we still want a
    // working sitemap for crawlers.
  }

  return base;
}

import type { MetadataRoute } from "next";
import { CANONICAL_PRODUCTION_APP_URL } from "@/lib/app-url";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? CANONICAL_PRODUCTION_APP_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/inbox", "/auth/"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}

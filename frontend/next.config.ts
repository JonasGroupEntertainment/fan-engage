import type { NextConfig } from "next";

const authSensitiveHeaders = [
  { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate, no-transform" },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
];

const authSensitiveRoutes = [
  "/auth/:path*",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/onboarding/:path*",
  "/premium",
  "/premium/:path*",
  "/account/:path*",
  "/me/:path*",
  "/admin/:path*",
  "/inbox/:path*",
  "/api/stripe/:path*",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uhovonrljcauaoctypbg.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      ...authSensitiveRoutes.map((source) => ({
        source,
        headers: authSensitiveHeaders,
      })),
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.fanengagepro.com",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type,Authorization,X-Requested-With",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src https://challenges.cloudflare.com; frame-ancestors 'none';",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "fan-engage-pearl.vercel.app" }],
        destination: "https://www.fanengagepro.com/",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "fan-engage-pearl.vercel.app" }],
        destination: "https://www.fanengagepro.com/:path*",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "host", value: "fanengagepro.com" }],
        destination: "https://www.fanengagepro.com/",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "fanengagepro.com" }],
        destination: "https://www.fanengagepro.com/:path*",
        permanent: true,
      },
      {
        source: "/blakerichardson",
        destination: "/blake-richardson",
        permanent: false,
      },
      {
        source: "/shop",
        destination: "/marketplace",
        permanent: false,
      },
      {
        source: "/shop/:path*",
        destination: "/marketplace",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

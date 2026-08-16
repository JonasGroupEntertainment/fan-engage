/**
 * Forgiving parser for the admin Social links textarea.
 *
 * Accepts any of these formats per line:
 *   1. "Instagram | https://instagram.com/raelynnofficial"  (legacy explicit)
 *   2. "https://instagram.com/raelynnofficial"              (bare URL — auto-label)
 *   3. "instagram.com/raelynnofficial"                      (no protocol — assumes https://)
 *
 * Instagram / TikTok / Facebook raelynnofficial are correct. Official X is
 * https://x.com/RaeLynn (@RaeLynn) — do not use raelynnofficial on X.
 *
 * For bare URLs, the domain is matched against KNOWN_PLATFORMS to derive a
 * canonical label (so "Instagram" renders the official Instagram icon on the
 * public page). Unknown domains fall back to the hostname (e.g. "myband.com")
 * which still renders as a labeled pill via SocialIcon's fallback path.
 *
 * Lines that don't parse to anything usable are silently dropped — same
 * behavior as before, just with a much wider acceptance net.
 */

type SocialEntry = { label: string; href: string };

/**
 * Domain → canonical label. Hostnames are matched after stripping `www.`.
 * Order doesn't matter; first match wins. Keep this in sync with the icons
 * supported by `components/social-icon.tsx` so each known platform renders
 * with its brand icon and color.
 */
const KNOWN_PLATFORMS: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)instagram\.com$/, label: "Instagram" },
  { match: /(^|\.)tiktok\.com$/, label: "TikTok" },
  { match: /(^|\.)facebook\.com$|(^|\.)fb\.com$/, label: "Facebook" },
  { match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, label: "YouTube" },
  { match: /(^|\.)twitter\.com$|(^|\.)x\.com$/, label: "X" },
  { match: /(^|\.)threads\.net$/, label: "Threads" },
  { match: /(^|\.)spotify\.com$/, label: "Spotify" },
  { match: /(^|\.)music\.apple\.com$/, label: "Apple Music" },
  { match: /(^|\.)soundcloud\.com$/, label: "SoundCloud" },
  { match: /(^|\.)linkedin\.com$/, label: "LinkedIn" },
  { match: /(^|\.)pinterest\.com$/, label: "Pinterest" },
  { match: /(^|\.)snapchat\.com$/, label: "Snapchat" },
];

/** Strip leading `www.` from a hostname for cleaner pill fallbacks. */
function cleanHost(host: string): string {
  return host.replace(/^www\./i, "");
}

/** Look up canonical label for a hostname, or null if not a known platform. */
function labelFromHost(host: string): string | null {
  const lower = host.toLowerCase();
  for (const p of KNOWN_PLATFORMS) {
    if (p.match.test(lower)) return p.label;
  }
  return null;
}

/**
 * Parse a single textarea line into a {label, href} entry, or null if the
 * line is empty / unparseable.
 */
export function parseSocialLine(rawLine: string): SocialEntry | null {
  const line = rawLine.trim();
  if (!line) return null;

  // Format 1: explicit "Label | URL"
  if (line.includes("|")) {
    const [labelRaw, ...rest] = line.split("|");
    const label = (labelRaw ?? "").trim();
    const href = rest.join("|").trim();
    if (label && href) return { label, href };
    // Fall through if pipe was there but malformed (e.g. "| https://...").
  }

  // Format 2 & 3: bare URL — try to parse, adding https:// if missing.
  const candidate = /^https?:\/\//i.test(line) ? line : `https://${line}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  // Reject anything that doesn't look like a hostname (e.g. plain words).
  if (!/\./.test(url.hostname)) return null;

  const detected = labelFromHost(url.hostname);
  const label = detected ?? cleanHost(url.hostname);
  return { label, href: candidate };
}

/**
 * Parse the full textarea blob into a deduplicated array of social entries.
 *
 * Dedup is by lowercased label — if a user pastes both an Instagram handle
 * and a bare instagram.com URL, only the first survives. This matches the
 * SocialIcon component's React `key={label}` invariant.
 */
export function parseSocialLines(raw: string): SocialEntry[] {
  const out: SocialEntry[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const entry = parseSocialLine(line);
    if (!entry) continue;
    const key = entry.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/**
 * Pure checks for a static promo-link QR.
 *
 * The code encodes the link the staff member typed. The optional promotion
 * name never enters the payload. Nothing here contacts the network.
 */

export const PROMO_QR_MAX_BYTES = 1500;

export const PROMO_URL_MESSAGES = {
  empty: "Add the link this code should open.",
  malformed: "That doesn't look like a full link. Include https:// and the site name.",
  scheme: "Use a link that starts with http:// or https://.",
  credentials: "Remove the username and password from the link.",
  tooLong: "That link is too long to fit in a QR code. Use a shorter one.",
} as const;

export type PromoUrlResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

const CONTROL_OR_SPACE = /[\u0000-\u0020\u007F]/;

/**
 * Accept a trimmed absolute http(s) URL and return that exact string.
 * Reject other schemes, malformed input, and embedded usernames or passwords.
 */
export function validatePromoUrl(raw: unknown): PromoUrlResult {
  if (typeof raw !== "string") {
    return { ok: false, message: PROMO_URL_MESSAGES.empty };
  }
  const url = raw.trim();
  if (!url) return { ok: false, message: PROMO_URL_MESSAGES.empty };
  if (CONTROL_OR_SPACE.test(url)) {
    return { ok: false, message: PROMO_URL_MESSAGES.malformed };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: PROMO_URL_MESSAGES.scheme };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: PROMO_URL_MESSAGES.malformed };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: PROMO_URL_MESSAGES.scheme };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, message: PROMO_URL_MESSAGES.credentials };
  }
  if (!parsed.hostname || parsed.hostname === ".") {
    return { ok: false, message: PROMO_URL_MESSAGES.malformed };
  }

  const bytes = new TextEncoder().encode(url).length;
  if (bytes > PROMO_QR_MAX_BYTES) {
    return { ok: false, message: PROMO_URL_MESSAGES.tooLong };
  }

  return { ok: true, url };
}

/** File name only. Never appended to the encoded link. */
export function promoQrFileBase(name: string | null | undefined): string {
  const raw = (name ?? "").trim().slice(0, 80);
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug ? `${slug}-qr` : "promo-qr";
}

export type PromoQrReady = {
  ok: true;
  url: string;
  filenameBase: string;
  pngFilename: string;
  svgFilename: string;
};

export type PromoQrPrepared = PromoQrReady | { ok: false; message: string };

/**
 * Download gate. `ok` is false for an empty or unsafe link, which is what
 * disables the download buttons so a previous code cannot be saved.
 */
export function preparePromoQr(input: {
  url: string;
  name?: string | null;
}): PromoQrPrepared {
  const validated = validatePromoUrl(input.url);
  if (!validated.ok) return validated;
  const filenameBase = promoQrFileBase(input.name);
  return {
    ok: true,
    url: validated.url,
    filenameBase,
    pngFilename: `${filenameBase}.png`,
    svgFilename: `${filenameBase}.svg`,
  };
}

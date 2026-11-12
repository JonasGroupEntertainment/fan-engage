/**
 * Print files for a static promo QR.
 *
 * Same encoder for the on-screen preview, the PNG, and the SVG. White
 * background and a 4-module quiet zone are part of the file. The string
 * passed in is the only thing encoded — this module does not fetch it.
 *
 * qrcode.react draws the check-in and invite codes but does not export a
 * print-resolution PNG. This uses the `qrcode` package for that file.
 */

import { create, toDataURL, toString } from "qrcode";
import { validatePromoUrl } from "./url.ts";

export const PROMO_QR_PNG_PX = 2048;
export const PROMO_QR_MARGIN_MODULES = 4;
/** Quartile error correction: readable in print, still room for a long link. */
export const PROMO_QR_LEVEL = "Q" as const;
/** Matches the check-in QR ink color. */
export const PROMO_QR_DARK = "#050b1f";
export const PROMO_QR_LIGHT = "#ffffff";

function renderOptions(width: number) {
  return {
    errorCorrectionLevel: PROMO_QR_LEVEL,
    margin: PROMO_QR_MARGIN_MODULES,
    width,
    color: { dark: PROMO_QR_DARK, light: PROMO_QR_LIGHT },
  };
}

function assertEncodable(url: string): string {
  const validated = validatePromoUrl(url);
  if (!validated.ok) throw new Error(validated.message);
  return validated.url;
}

/** Bytes the encoder stored. Tests use this to prove the target link. */
export function promoQrPayload(url: string): string {
  const safe = assertEncodable(url);
  const qr = create(safe, { errorCorrectionLevel: PROMO_QR_LEVEL });
  return qr.segments
    .map((segment) => {
      if (segment.mode.id === "Byte" && segment.data instanceof Uint8Array) {
        return new TextDecoder().decode(segment.data);
      }
      if (typeof segment.data === "string") return segment.data;
      return "";
    })
    .join("");
}

export async function renderPromoQrSvg(url: string): Promise<string> {
  const safe = assertEncodable(url);
  const svg = await toString(safe, { ...renderOptions(PROMO_QR_PNG_PX), type: "svg" });
  if (!svg.startsWith("<svg") || /<script/i.test(svg) || /javascript:/i.test(svg)) {
    throw new Error("Could not draw this code.");
  }
  return svg;
}

export async function renderPromoQrPngDataUrl(url: string): Promise<string> {
  const safe = assertEncodable(url);
  const dataUrl = await toDataURL(safe, renderOptions(PROMO_QR_PNG_PX));
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Could not draw this code.");
  }
  return dataUrl;
}

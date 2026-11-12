import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAdminCommunity } from "../admin-authz.ts";
import { PORTAL_MIN_ROLE, canAccessPortalSurface } from "../artist-portal/roles.ts";
import { buildPromoDestinations } from "./destinations.ts";
import {
  PROMO_QR_DARK,
  PROMO_QR_LEVEL,
  PROMO_QR_LIGHT,
  PROMO_QR_MARGIN_MODULES,
  PROMO_QR_PNG_PX,
  promoQrPayload,
  renderPromoQrPngDataUrl,
  renderPromoQrSvg,
} from "./render.ts";
import {
  PROMO_QR_MAX_BYTES,
  PROMO_URL_MESSAGES,
  preparePromoQr,
  validatePromoUrl,
} from "./url.ts";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDist = Math.abs(estimate - left);
  const upDist = Math.abs(estimate - up);
  const upLeftDist = Math.abs(estimate - upLeft);
  if (leftDist <= upDist && leftDist <= upLeftDist) return left;
  if (upDist <= upLeftDist) return up;
  return upLeft;
}

function decodePng(buf: Buffer): { width: number; height: number; rgba: Buffer } {
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert.equal(data[12], 0, "interlaced PNG");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);
  const bpp = 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * bpp);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? recon[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let value = row[i];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`unexpected png filter ${filter}`);
      recon[i] = value;
    }
    recon.copy(rgba, y * stride);
    prev = recon;
  }
  return { width, height, rgba };
}

function pixel(img: { width: number; rgba: Buffer }, x: number, y: number): number[] {
  const index = (y * img.width + x) * 4;
  return [
    img.rgba[index],
    img.rgba[index + 1],
    img.rgba[index + 2],
    img.rgba[index + 3],
  ];
}

const ORIGIN = "https://www.fanengagepro.com";
const SHOW = "https://example.com/show";

describe("validatePromoUrl", () => {
  it("keeps a trimmed absolute http(s) link exactly", () => {
    const exact = "HTTPS://Example.com/Path?q=1#frag";
    const result = validatePromoUrl(`  ${exact}  `);
    assert.deepEqual(result, { ok: true, url: exact });
    assert.deepEqual(validatePromoUrl("http://localhost:3000/artists/a"), {
      ok: true,
      url: "http://localhost:3000/artists/a",
    });
  });

  it("rejects empty, relative, malformed, and non-http schemes", () => {
    assert.deepEqual(validatePromoUrl(""), { ok: false, message: PROMO_URL_MESSAGES.empty });
    assert.deepEqual(validatePromoUrl("   "), { ok: false, message: PROMO_URL_MESSAGES.empty });
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "ftp://example.com/a",
    ]) {
      assert.equal(validatePromoUrl(bad).ok, false, bad);
      assert.equal(
        validatePromoUrl(bad).ok ? "" : (validatePromoUrl(bad) as { message: string }).message,
        PROMO_URL_MESSAGES.scheme,
        bad,
      );
    }
    for (const bad of ["/artists/danger-twins", "example.com/a", "https:example.com", "not a url"]) {
      const result = validatePromoUrl(bad);
      assert.equal(result.ok, false, bad);
    }
  });

  it("rejects embedded credentials and broken whitespace", () => {
    assert.equal(
      validatePromoUrl("https://user:pass@example.com/a").ok
        ? ""
        : (validatePromoUrl("https://user:pass@example.com/a") as { message: string }).message,
      PROMO_URL_MESSAGES.credentials,
    );
    assert.equal(
      validatePromoUrl("https://user@example.com/a").ok
        ? ""
        : (validatePromoUrl("https://user@example.com/a") as { message: string }).message,
      PROMO_URL_MESSAGES.credentials,
    );
    const spaced = validatePromoUrl("https://example.com/a b");
    assert.equal(spaced.ok, false);
    assert.equal(spaced.ok ? "" : spaced.message, PROMO_URL_MESSAGES.malformed);
  });

  it("rejects links that are too long to encode and accepts a long https link", () => {
    const prefix = "https://example.com/";
    const fitted = prefix + "a".repeat(PROMO_QR_MAX_BYTES - prefix.length);
    assert.equal(new TextEncoder().encode(fitted).length, PROMO_QR_MAX_BYTES);
    assert.equal(validatePromoUrl(fitted).ok, true);
    const tooLong = fitted + "a";
    const rejected = validatePromoUrl(tooLong);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.ok ? "" : rejected.message, PROMO_URL_MESSAGES.tooLong);
  });
});

describe("preparePromoQr", () => {
  it("uses the name only for the file, never the encoded link", () => {
    const ready = preparePromoQr({ url: `  ${SHOW}  `, name: "  Summer Tour!! " });
    assert.equal(ready.ok, true);
    if (!ready.ok) return;
    assert.equal(ready.url, SHOW);
    assert.equal(ready.pngFilename, "summer-tour-qr.png");
    assert.equal(ready.svgFilename, "summer-tour-qr.svg");
    assert.equal(ready.url.includes("Summer"), false);
    assert.equal(ready.url.includes("summer-tour"), false);
  });

  it("falls back to a safe filename and refuses an invalid link", () => {
    const unnamed = preparePromoQr({ url: SHOW, name: "   " });
    assert.equal(unnamed.ok && unnamed.pngFilename, "promo-qr.png");
    const traversal = preparePromoQr({ url: SHOW, name: "../../etc/passwd" });
    assert.equal(traversal.ok, true);
    if (traversal.ok) {
      assert.equal(traversal.pngFilename.includes("/"), false);
      assert.equal(traversal.pngFilename.includes(".."), false);
    }
    const stale = preparePromoQr({ url: "javascript:alert(1)", name: "Summer Tour" });
    assert.equal(stale.ok, false);
  });
});

describe("buildPromoDestinations", () => {
  const events = [
    { id: "show-1", title: "Ryman", url: "https://tickets.example/ryman", active: true },
    { id: "bad", title: "Script", url: "javascript:alert(1)", active: true },
    { id: "creds", title: "Creds", url: "https://user:pass@tickets.example/x", active: true },
    { id: "file", title: "File", url: "file:///tmp/x", active: true },
    { id: "off", title: "Old show", url: "https://tickets.example/old", active: false },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `extra-${index}`,
      title: `Extra ${index}`,
      url: `https://tickets.example/extra-${index}`,
      active: true,
    })),
  ];

  const dests = buildPromoDestinations({
    appUrl: ORIGIN,
    artistSlug: "danger-twins",
    artistName: "Danger Twins",
    merchUrl: "https://shop.example/dt",
    events,
  });

  it("offers this artist's real public pages and safe saved links", () => {
    assert.deepEqual(
      dests.map((d) => d.id).slice(0, 6),
      ["page", "community", "signup", "rewards", "founders", "merch"],
    );
    assert.equal(dests.find((d) => d.id === "page")?.url, `${ORIGIN}/artists/danger-twins`);
    assert.equal(
      dests.find((d) => d.id === "community")?.url,
      `${ORIGIN}/artists/danger-twins/community`,
    );
    assert.equal(
      dests.find((d) => d.id === "signup")?.url,
      `${ORIGIN}/signup?ref=danger-twins&next=%2Fartists%2Fdanger-twins`,
    );
    assert.equal(dests.find((d) => d.id === "rewards")?.url, `${ORIGIN}/artists/danger-twins/rewards`);
    assert.equal(
      dests.find((d) => d.id === "founders")?.url,
      `${ORIGIN}/artists/danger-twins/founders`,
    );
    assert.equal(dests.find((d) => d.id === "merch")?.url, "https://shop.example/dt");
    assert.equal(dests.find((d) => d.id === "event-show-1")?.url, "https://tickets.example/ryman");
  });

  it("drops unsafe, inactive, and extra event links and never leaves this tenant", () => {
    const eventIds = dests.filter((d) => d.id.startsWith("event-")).map((d) => d.id);
    assert.equal(eventIds.length, 8);
    assert.equal(eventIds.includes("event-show-1"), true);
    assert.equal(eventIds.includes("event-off"), false);
    assert.equal(eventIds.includes("event-bad"), false);
    for (const dest of dests) {
      assert.equal(dest.url.includes("Danger"), false);
      assert.equal(dest.url.includes("javascript:"), false);
      assert.equal(dest.url.includes("user:pass"), false);
      assert.equal(dest.url.includes("/checkin"), false);
      assert.equal(/\/artists\/danger-twins\/events(?:\/|$|\?)/.test(dest.url), false);
      if (dest.url.startsWith(ORIGIN)) {
        assert.match(dest.url, /danger-twins/);
        assert.doesNotMatch(dest.url, /raelynn|amy-stroup/);
      }
    }
  });

  it("returns nothing for a bad slug or a non-http app origin", () => {
    assert.deepEqual(
      buildPromoDestinations({
        appUrl: ORIGIN,
        artistSlug: "../etc",
        artistName: "Nope",
      }),
      [],
    );
    assert.deepEqual(
      buildPromoDestinations({
        appUrl: "javascript:alert(1)",
        artistSlug: "danger-twins",
        artistName: "Danger Twins",
      }),
      [],
    );
  });
});

describe("promo QR export", () => {
  it("encodes the link itself, at print size, with a white quiet zone", async () => {
    const ready = preparePromoQr({ url: SHOW, name: "Summer Tour" });
    assert.equal(ready.ok, true);
    if (!ready.ok) return;

    assert.equal(promoQrPayload(ready.url), SHOW);
    assert.equal(PROMO_QR_PNG_PX, 2048);
    assert.equal(PROMO_QR_MARGIN_MODULES, 4);
    assert.equal(PROMO_QR_LEVEL, "Q");
    assert.equal(PROMO_QR_LIGHT, "#ffffff");
    assert.equal(PROMO_QR_DARK, "#050b1f");

    const svg = await renderPromoQrSvg(ready.url);
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /width="2048"/);
    assert.match(svg, /height="2048"/);
    assert.match(svg, /fill="#ffffff"/);
    assert.match(svg, /stroke="#050b1f"/);
    assert.doesNotMatch(svg, /Summer/);
    assert.doesNotMatch(svg, /<script/i);

    const dataUrl = await renderPromoQrPngDataUrl(ready.url);
    assert.match(dataUrl, /^data:image\/png;base64,/);
    const png = decodePng(Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
    assert.equal(png.width, 2048);
    assert.equal(png.height, 2048);
    assert.deepEqual(pixel(png, 0, 0), [255, 255, 255, 255]);
    assert.deepEqual(pixel(png, 12, 12), [255, 255, 255, 255]);
    assert.deepEqual(pixel(png, 2047, 2047), [255, 255, 255, 255]);
    let dark = 0;
    for (let y = 200; y < 1800; y += 40) {
      for (let x = 200; x < 1800; x += 40) {
        const [r, g, b] = pixel(png, x, y);
        if (r === 5 && g === 11 && b === 31) dark += 1;
      }
    }
    assert.ok(dark > 10, `expected ink pixels, saw ${dark}`);
  });

  it("refuses to draw an unsafe link", async () => {
    await assert.rejects(() => renderPromoQrSvg("javascript:alert(1)"));
    await assert.rejects(() => renderPromoQrPngDataUrl("file:///etc/passwd"));
    await assert.rejects(() => renderPromoQrSvg("https://user:pass@example.com/a"));
  });
});

describe("promo QR access", () => {
  it("is editor-and-above on the portal, and admin editors cannot cross tenants", () => {
    assert.equal(PORTAL_MIN_ROLE.promoQr, "editor");
    assert.equal(PORTAL_MIN_ROLE.checkinQr, "editor");
    assert.equal(canAccessPortalSurface("editor", "promoQr"), true);
    assert.equal(canAccessPortalSurface("viewer", "promoQr"), false);
    assert.equal(canAccessPortalSurface("viewer", "checkinQr"), false);

    const editor = {
      isSuperAdmin: false,
      communities: ["danger-twins"],
      currentCommunityId: "danger-twins",
      role: "editor" as const,
    };
    assert.equal(canAdminCommunity(editor, "danger-twins", "editor"), true);
    assert.equal(canAdminCommunity(editor, "raelynn", "editor"), false);
    assert.equal(
      canAdminCommunity({ ...editor, role: "viewer" }, "danger-twins", "editor"),
      false,
    );
    assert.equal(
      canAdminCommunity(
        { ...editor, currentCommunityId: "raelynn" },
        "raelynn",
        "editor",
      ),
      false,
    );
  });

  it("gates the admin and portal pages and lists them in navigation", () => {
    const adminPage = read("../../app/admin/promo-qr/page.tsx");
    assert.match(adminPage, /getAdminContext\(\)/);
    assert.match(adminPage, /redirect\("\/login\?next=\/admin\/promo-qr"\)/);
    assert.match(adminPage, /canAdminCommunity\(ctx, communityId, "editor"\)/);
    assert.match(adminPage, /redirect\("\/admin"\)/);
    assert.match(adminPage, /loadPromoQrContext\(communityId\)/);
    assert.doesNotMatch(adminPage, /checkin-token|mintCheckinToken/);

    const portalPage = read("../../app/artist-portal/promo-qr/page.tsx");
    assert.match(portalPage, /requirePortalPage\("promoQr", "\/artist-portal\/promo-qr"\)/);
    assert.match(portalPage, /loadPromoQrContext\(ctx\.communityId\)/);

    const adminNav = read("../../app/admin/layout.tsx");
    assert.match(adminNav, /href: "\/admin\/promo-qr", label: "Promo QR", minRole: "editor"/);
    const portalNav = read("../../app/artist-portal/layout.tsx");
    assert.match(portalNav, /href: "\/artist-portal\/promo-qr", label: "Promo QR", surface: "promoQr"/);
  });

  it("does not fetch the typed link or write a QR record", () => {
    for (const file of [
      "./url.ts",
      "./destinations.ts",
      "./render.ts",
      "./load.ts",
      "../../app/admin/promo-qr/page.tsx",
      "../../app/artist-portal/promo-qr/page.tsx",
      "../../components/promo-qr-tool.tsx",
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /\bfetch\s*\(/, file);
      assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\s*\(/, file);
    }
    const load = read("./load.ts");
    assert.match(load, /\.eq\("slug", slug\)/);
    assert.match(load, /listEventsForAdmin\(slug\)/);
  });
});

describe("promo QR page copy and download gate", () => {
  const tool = read("../../components/promo-qr-tool.tsx");

  it("asks for a name and a destination in plain language", () => {
    assert.match(tool, /What are you promoting\?/);
    assert.match(tool, /Where should the code take people\?/);
    assert.match(tool, /Download QR code/);
    assert.match(tool, /Download SVG/);
    assert.match(tool, /not\s+check-in/i);
    assert.match(tool, /does not expire/);
    assert.match(tool, /does not create a page/);
    assert.match(tool, /Scanning opens this link/);
    assert.doesNotMatch(tool, /Error correction|marginSize|errorCorrectionLevel/);
  });

  it("downloads the validated link only, and disables that when the link is bad", () => {
    assert.match(tool, /const prepared = preparePromoQr\(\{ url, name \}\)/);
    assert.match(tool, /disabled=\{!prepared\.ok \|\| busy !== null\}/);
    assert.match(tool, /renderPromoQrPngDataUrl\(current\.url\)/);
    assert.match(tool, /renderPromoQrSvg\(current\.url\)/);
    assert.match(tool, /if \(!current\.ok\) return/);
    assert.doesNotMatch(tool, /renderPromoQrPngDataUrl\(\s*name/);
    assert.doesNotMatch(tool, /renderPromoQrSvg\(\s*name/);
  });
});

describe("check-in QR regression", () => {
  it("still rotates a signed check-in code and does not use the promo encoder", () => {
    const widget = read("../../app/artist-portal/checkin-qr/checkin-qr.tsx");
    assert.match(widget, /\/api\/admin\/checkin-token/);
    assert.match(widget, /rotation === "on"/);
    assert.match(widget, /QRCodeSVG/);
    assert.doesNotMatch(widget, /promo-qr|validatePromoUrl|preparePromoQr/);

    const page = read("../../app/artist-portal/checkin-qr/page.tsx");
    assert.match(page, /mintCheckinToken/);
    assert.match(page, /requirePortalPage\("checkinQr"/);

    const route = read("../../app/api/admin/checkin-token/route.ts");
    assert.match(route, /mintCheckinToken/);
    assert.match(route, /PORTAL_MIN_ROLE\.checkinQr/);

    const token = read("../checkin-token.ts");
    assert.match(token, /CHECKIN_TOKEN_SECRET/);
    assert.match(token, /createHmac/);
    assert.doesNotMatch(token, /promo-qr|validatePromoUrl/);
  });
});

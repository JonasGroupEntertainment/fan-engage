import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { imageFileName, sniffImageType } from "./image-signature.ts";

const b = (...xs: number[]) => new Uint8Array(xs);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

test("recognises the four allowed image types by their first bytes", () => {
  assert.equal(sniffImageType(b(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)), "image/jpeg");
  assert.equal(sniffImageType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)), "image/png");
  assert.equal(sniffImageType(ascii("GIF89a....")), "image/gif");
  assert.equal(sniffImageType(ascii("GIF87a....")), "image/gif");
  assert.equal(sniffImageType(ascii("RIFF\u0010\u0000\u0000\u0000WEBPVP8 ")), "image/webp");
});

test("refuses files that only claim to be images", () => {
  assert.equal(sniffImageType(ascii("<html><body>test page</body></html>")), null);
  assert.equal(sniffImageType(ascii("hello\n")), null);
  assert.equal(sniffImageType(ascii("<svg xmlns=")), null);
  assert.equal(sniffImageType(ascii("RIFF\u0010\u0000\u0000\u0000WAVEfmt ")), null);
  assert.equal(sniffImageType(ascii("GIF80a")), null);
  assert.equal(sniffImageType(b()), null);
  assert.equal(sniffImageType(b(0xff, 0xd8)), null);
});

describe("imageFileName", () => {
  it("takes the extension from the real type, not from the name sent", () => {
    assert.equal(imageFileName("holiday.html", "image/png"), "holiday.png");
    assert.equal(imageFileName("photo.svg", "image/jpeg"), "photo.jpg");
  });

  it("leaves no second extension behind", () => {
    assert.equal(imageFileName("a.html.png", "image/gif"), "a-html.gif");
  });

  it("copes with a name that has no stem or no extension", () => {
    assert.equal(imageFileName(".png", "image/webp"), "file.webp");
    assert.equal(imageFileName("picture", "image/jpeg"), "picture.jpg");
  });
});

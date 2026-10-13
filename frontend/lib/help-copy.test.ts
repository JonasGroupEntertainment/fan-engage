import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("help, pricing perk, and header copy", () => {
  it("adds 48-hour early RSVP beside the pricing founder perk", () => {
    const premium = readRepo("../app/premium/page.tsx");
    assert.match(
      premium,
      /numbered badge and 1\.5× points, plus 48-hour early RSVP/,
    );
  });

  it("adds the perk to the in-code founding card without a new count", () => {
    const block = readRepo("../components/founding-fan-block.tsx");
    assert.match(
      block,
      /numbered badge and 1\.5× points, plus\s+48-hour early RSVP/,
    );
  });

  it("help answers the public questions and does not show a founding count", () => {
    const help = readRepo("../app/help/page.tsx");
    assert.match(help, /What is Fan Engage Pro\?/);
    assert.match(help, /Founding Fan perks/);
    assert.match(help, /Premium billing/);
    assert.match(help, /How to cancel/);
    assert.match(help, /href="\/cancellation-refund"/);
    assert.match(help, /href="\/terms"/);
    assert.match(help, /How points work/);
    assert.match(help, /numbered badge and 1\.5× points,\s+plus 48-hour early RSVP/);
    assert.match(help, /support@fanengagepro\.com/);
    assert.match(help, /TODO: support@fanengagepro\.com inbox is being set up/);
    assert.equal(help.includes("raymond@jonasgroup.com"), false);
    assert.doesNotMatch(help, /first\s+100/i);
    assert.doesNotMatch(help, /spots left/i);
    assert.doesNotMatch(help, /\d+\s+of\s+\d+/);
  });

  it("links Help in the footer and brands the header Fan Engage Pro", () => {
    const footer = readRepo("../components/footer.tsx");
    const header = readRepo("../app/layout.tsx");
    assert.match(footer, /href="\/help"/);
    assert.match(header, /Fan Engage Pro/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSameOriginRequest, sameOriginHeadersOf } from "./same-origin-request.ts";

const host = "www.fanengagepro.com";

describe("isSameOriginRequest (sign-out guard)", () => {
  it("allows a request from this site", () => {
    assert.equal(isSameOriginRequest({ secFetchSite: "same-origin", origin: `https://${host}`, host }), true);
    assert.equal(isSameOriginRequest({ secFetchSite: null, origin: `https://${host}`, host }), true);
  });

  it("refuses another website, even a sibling subdomain", () => {
    assert.equal(isSameOriginRequest({ secFetchSite: "cross-site", origin: "https://evil.example", host }), false);
    assert.equal(
      isSameOriginRequest({ secFetchSite: "same-site", origin: "https://raelynn.fanengagepro.com", host }),
      false,
    );
    assert.equal(isSameOriginRequest({ secFetchSite: "none", origin: null, host }), false);
    assert.equal(isSameOriginRequest({ secFetchSite: null, origin: "https://evil.example", host }), false);
    assert.equal(isSameOriginRequest({ secFetchSite: null, origin: "null", host }), false);
    assert.equal(isSameOriginRequest({ secFetchSite: null, origin: "not a url", host }), false);
    assert.equal(isSameOriginRequest({ secFetchSite: null, origin: `https://${host}`, host: null }), false);
  });

  it("Sec-Fetch-Site wins over a matching Origin", () => {
    assert.equal(isSameOriginRequest({ secFetchSite: "cross-site", origin: `https://${host}`, host }), false);
  });

  it("allows non-browser clients that send neither header", () => {
    assert.equal(isSameOriginRequest({ secFetchSite: null, origin: null, host }), true);
  });

  it("reads the headers from a Headers object", () => {
    const h = new Headers({ "sec-fetch-site": "same-origin", origin: `https://${host}`, host });
    assert.deepEqual(sameOriginHeadersOf(h), {
      secFetchSite: "same-origin",
      origin: `https://${host}`,
      host,
    });
  });
});

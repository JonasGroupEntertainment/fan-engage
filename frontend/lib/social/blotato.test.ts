import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOTATO_API_KEY_HEADER,
  BLOTATO_POSTS_URL,
  buildBlotatoPostBody,
  createBlotatoPublisher,
} from "./blotato.ts";
import type { SocialSendRequest } from "./social-post.ts";

const fbRequest: SocialSendRequest = {
  platform: "facebook",
  accountId: "98433",
  pageId: "123456789",
  text: "Hello",
  mediaUrls: ["https://cdn.example.com/a.jpg"],
};
const igRequest: SocialSendRequest = {
  platform: "instagram",
  accountId: "98434",
  pageId: null,
  text: "Hello",
  mediaUrls: ["https://cdn.example.com/a.jpg"],
};

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("buildBlotatoPostBody", () => {
  it("builds the Facebook shape with the Page id", () => {
    assert.deepEqual(buildBlotatoPostBody(fbRequest), {
      post: {
        accountId: "98433",
        content: { text: "Hello", mediaUrls: ["https://cdn.example.com/a.jpg"], platform: "facebook" },
        target: { targetType: "facebook", pageId: "123456789" },
      },
    });
  });
  it("builds the Instagram shape with no Page id", () => {
    assert.deepEqual(buildBlotatoPostBody(igRequest), {
      post: {
        accountId: "98434",
        content: { text: "Hello", mediaUrls: ["https://cdn.example.com/a.jpg"], platform: "instagram" },
        target: { targetType: "instagram" },
      },
    });
  });
  it("sends an empty media list for a text only post", () => {
    const body = buildBlotatoPostBody({ ...fbRequest, mediaUrls: [] });
    assert.deepEqual(body.post.content.mediaUrls, []);
  });
});

describe("createBlotatoPublisher", () => {
  it("posts JSON with the key header and returns the submission id", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(201, { postSubmissionId: "sub-1" }));
    const publisher = createBlotatoPublisher({ apiKey: "test-key", fetchImpl });
    const result = await publisher.publish(fbRequest);
    assert.deepEqual(result, { ok: true, providerRef: "sub-1" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, BLOTATO_POSTS_URL);
    assert.equal(calls[0].init.method, "POST");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers[BLOTATO_API_KEY_HEADER], "test-key");
    assert.equal(headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), buildBlotatoPostBody(fbRequest));
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });
  it("returns an error value for a rate limit, with the provider message", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(429, { statusCode: 429, message: "Rate limit exceeded, retry in 49 seconds" }),
    );
    const result = await createBlotatoPublisher({ apiKey: "test-key", fetchImpl }).publish(igRequest);
    assert.deepEqual(result, { ok: false, error: "HTTP 429: Rate limit exceeded, retry in 49 seconds" });
  });
  it("returns an error value for a body that is not JSON", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("<html>oops</html>", { status: 502 }));
    const result = await createBlotatoPublisher({ apiKey: "test-key", fetchImpl }).publish(fbRequest);
    assert.deepEqual(result, { ok: false, error: "HTTP 502" });
  });
  it("returns an error value when a success has no submission id", async () => {
    const { fetchImpl } = fakeFetch(() => json(201, {}));
    const result = await createBlotatoPublisher({ apiKey: "test-key", fetchImpl }).publish(fbRequest);
    assert.equal(result.ok, false);
  });
  it("returns an error value when fetch throws, and never includes the key", async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new Error("network down for test-key");
    });
    const result = await createBlotatoPublisher({ apiKey: "test-key", fetchImpl }).publish(fbRequest);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && !result.error.includes("test-key"));
  });
  it("gives up after the timeout", async () => {
    // A real request keeps the process busy while it waits. This stand-in
    // does the same with a timer, because the timeout's own timer does not,
    // and on Node 22 the test would otherwise end before the timeout fires.
    const KEEP_BUSY_MS = 5000;
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const busy = setTimeout(() => reject(new Error("the timeout never fired")), KEEP_BUSY_MS);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(busy);
          reject(init.signal?.reason);
        });
      })) as typeof fetch;
    const result = await createBlotatoPublisher({ apiKey: "k", fetchImpl, timeoutMs: 20 }).publish(fbRequest);
    assert.deepEqual(result, { ok: false, error: "Timed out" });
  });
  it("sends nothing without a key", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(201, { postSubmissionId: "x" }));
    const result = await createBlotatoPublisher({ apiKey: "  ", fetchImpl }).publish(fbRequest);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });
});

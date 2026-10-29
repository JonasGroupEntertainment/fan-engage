import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEAR_YOU_MILES, eventDistance, fanHomeCoords } from "./near.ts";

const NASHVILLE = { lat: 36.1627, lng: -86.7816 };
const FRANKLIN_TN = { lat: 35.9251, lng: -86.8689 };
const AUSTIN = { lat: 30.2672, lng: -97.7431 };

describe("eventDistance", () => {
  it("flags a nearby venue", () => {
    const d = eventDistance(NASHVILLE, FRANKLIN_TN);
    assert.ok(d.distanceMiles !== null && d.distanceMiles < NEAR_YOU_MILES);
    assert.equal(d.nearYou, true);
  });

  it("shows distance but not Near you for a far venue", () => {
    const d = eventDistance(NASHVILLE, AUSTIN);
    assert.ok(d.distanceMiles !== null && d.distanceMiles > 700);
    assert.equal(d.nearYou, false);
  });

  it("hides distance when either side is missing", () => {
    assert.deepEqual(eventDistance(null, AUSTIN), { distanceMiles: null, nearYou: false });
    assert.deepEqual(eventDistance(NASHVILLE, { lat: null, lng: null }), {
      distanceMiles: null,
      nearYou: false,
    });
    assert.deepEqual(eventDistance({ lat: 36, lng: undefined }, AUSTIN), {
      distanceMiles: null,
      nearYou: false,
    });
  });
});

describe("fanHomeCoords", () => {
  it("reads home_lat/home_lng and returns null when unset or pre-0090", () => {
    assert.deepEqual(fanHomeCoords({ home_lat: 1, home_lng: 2 }), { lat: 1, lng: 2 });
    assert.equal(fanHomeCoords({ home_lat: null, home_lng: 2 }), null);
    assert.equal(fanHomeCoords({}), null);
    assert.equal(fanHomeCoords(null), null);
  });
});

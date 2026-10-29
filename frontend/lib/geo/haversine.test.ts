import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distanceMilesBetween, hasCoords, haversineMiles } from "./haversine.ts";

const NASHVILLE = { lat: 36.1627, lng: -86.7816 };
const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const LA = { lat: 34.0522, lng: -118.2437 };
const NYC = { lat: 40.7128, lng: -74.006 };

describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    assert.equal(haversineMiles(NASHVILLE, NASHVILLE), 0);
  });

  it("is symmetric", () => {
    assert.equal(haversineMiles(NASHVILLE, AUSTIN), haversineMiles(AUSTIN, NASHVILLE));
  });

  it("matches known city-to-city distances within 1%", () => {
    // Published great-circle figures.
    const laNyc = haversineMiles(LA, NYC);
    assert.ok(Math.abs(laNyc - 2445) / 2445 < 0.01, `LA-NYC ${laNyc}`);
    const nashAustin = haversineMiles(NASHVILLE, AUSTIN);
    assert.ok(Math.abs(nashAustin - 755) / 755 < 0.01, `Nashville-Austin ${nashAustin}`);
  });

  it("handles antipodes without NaN", () => {
    const d = haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    assert.ok(Number.isFinite(d));
    assert.ok(d > 12400 && d < 12500);
  });
});

describe("hasCoords", () => {
  it("rejects null, undefined and NaN", () => {
    assert.equal(hasCoords({ lat: null, lng: 1 }), false);
    assert.equal(hasCoords({ lat: 1, lng: undefined }), false);
    assert.equal(hasCoords({ lat: Number.NaN, lng: 1 }), false);
    assert.equal(hasCoords({ lat: 0, lng: 0 }), true);
  });
});

describe("distanceMilesBetween", () => {
  it("returns null when either side is missing coordinates", () => {
    assert.equal(distanceMilesBetween({ lat: null, lng: null }, AUSTIN), null);
    assert.equal(distanceMilesBetween(NASHVILLE, { lat: 30, lng: null }), null);
  });

  it("rounds to whole miles", () => {
    const d = distanceMilesBetween(NASHVILLE, AUSTIN);
    assert.ok(d !== null && Number.isInteger(d));
  });
});

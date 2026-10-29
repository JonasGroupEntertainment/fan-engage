import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  US_CITY_COUNT,
  normalizeCity,
  normalizeRegion,
  resolveCityCoords,
  splitCityAndRegion,
} from "./resolve.ts";
import { US_CITIES } from "./us-cities.ts";

describe("us-cities table", () => {
  it("covers the largest metros and every live RaeLynn event city", () => {
    assert.ok(US_CITY_COUNT >= 150, `only ${US_CITY_COUNT} cities`);
    for (const key of ["austin|tx", "greenville|tx", "nashville|tn", "dallas|tx", "houston|tx"]) {
      assert.ok(US_CITIES[key], `missing ${key}`);
    }
  });

  it("stores plausible WGS84 coordinates for the continental US + AK/HI", () => {
    for (const [key, [lat, lng]] of Object.entries(US_CITIES)) {
      assert.ok(lat > 18 && lat < 72, `${key} lat ${lat}`);
      assert.ok(lng < -66 && lng > -180, `${key} lng ${lng}`);
      assert.match(key, /^[a-z][a-z .'-]*\|[a-z]{2}$/, `bad key ${key}`);
    }
  });
});

describe("normalizeRegion", () => {
  it("accepts codes and names in any case", () => {
    assert.equal(normalizeRegion("TX"), "tx");
    assert.equal(normalizeRegion(" tx "), "tx");
    assert.equal(normalizeRegion("Texas"), "tx");
    assert.equal(normalizeRegion("New York"), "ny");
    assert.equal(normalizeRegion("D.C."), "dc");
  });
  it("rejects unknown regions", () => {
    assert.equal(normalizeRegion("Ontario"), null);
    assert.equal(normalizeRegion(""), null);
    assert.equal(normalizeRegion(null), null);
  });
});

describe("normalizeCity", () => {
  it("folds case, whitespace and Saint/St./Ft. drift", () => {
    assert.equal(normalizeCity("  AUSTIN "), "austin");
    assert.equal(normalizeCity("Saint Louis"), "st. louis");
    assert.equal(normalizeCity("St Louis"), "st. louis");
    assert.equal(normalizeCity("ST. LOUIS"), "st. louis");
    assert.equal(normalizeCity("Ft. Worth"), "fort worth");
    assert.equal(normalizeCity("Winston - Salem"), "winston-salem");
    assert.equal(normalizeCity("Nashville."), "nashville");
  });
});

describe("splitCityAndRegion", () => {
  it("peels a trailing state off the city string", () => {
    assert.deepEqual(splitCityAndRegion("Austin, TX"), { city: "Austin", region: "tx" });
    assert.deepEqual(splitCityAndRegion("Austin TX"), { city: "Austin", region: "tx" });
    assert.deepEqual(splitCityAndRegion("Greenville, Texas"), { city: "Greenville", region: "tx" });
    assert.deepEqual(splitCityAndRegion("Nashville, TN 37203"), { city: "Nashville", region: "tn" });
    assert.deepEqual(splitCityAndRegion("New York, New York"), { city: "New York", region: "ny" });
  });
  it("leaves a plain city alone", () => {
    assert.deepEqual(splitCityAndRegion("Nashville"), { city: "Nashville", region: null });
    assert.deepEqual(splitCityAndRegion("Round Rock"), { city: "Round Rock", region: null });
  });
});

describe("resolveCityCoords", () => {
  it("resolves the live event cities", () => {
    const austin = resolveCityCoords("Austin", "TX");
    assert.ok(austin);
    assert.equal(austin.key, "austin|tx");
    assert.ok(Math.abs(austin.lat - 30.27) < 0.05);

    assert.equal(resolveCityCoords("Greenville", "TX")?.key, "greenville|tx");
    assert.equal(resolveCityCoords("Greenville", "SC")?.key, "greenville|sc");
    assert.equal(resolveCityCoords("Nashville", "TN")?.key, "nashville|tn");
  });

  it("is forgiving about case, punctuation and embedded state", () => {
    assert.equal(resolveCityCoords("AUSTIN, tx")?.key, "austin|tx");
    assert.equal(resolveCityCoords("Austin, Texas", "")?.key, "austin|tx");
    assert.equal(resolveCityCoords("Saint Louis", "Missouri")?.key, "st. louis|mo");
    assert.equal(resolveCityCoords("St Petersburg", "FL")?.key, "st. petersburg|fl");
    assert.equal(resolveCityCoords("Ft Worth", "TX")?.key, "fort worth|tx");
    assert.equal(resolveCityCoords("Winston Salem", "NC")?.key, "winston-salem|nc");
  });

  it("prefers the explicit region over one embedded in the city", () => {
    assert.equal(resolveCityCoords("Greenville, SC", "TX")?.key, "greenville|tx");
  });

  it("resolves a unique city without a region but refuses ambiguous ones", () => {
    assert.equal(resolveCityCoords("Nashville")?.key, "nashville|tn");
    assert.equal(resolveCityCoords("Columbus"), null);
    assert.equal(resolveCityCoords("Portland"), null);
    assert.equal(resolveCityCoords("Greenville"), null);
  });

  it("returns null for unknowns and blanks", () => {
    assert.equal(resolveCityCoords("Atlantis", "TX"), null);
    assert.equal(resolveCityCoords("", "TX"), null);
    assert.equal(resolveCityCoords(null, "TX"), null);
    assert.equal(resolveCityCoords("Austin", "Ontario"), null);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInventoryQuery,
  inventoryPageUrl,
  isExpectedInventoryRequest,
  parseTeslaApiListing,
  parseTeslaApiPayload,
} from "../src/tesla-api.js";

const config = {
  postalCode: "92360",
  searchRange: 0,
  latitude: 48.8127,
  longitude: 2.2382,
};

test("builds the exact new Model Y page and API query", () => {
  const pageUrl = new URL(inventoryPageUrl(config));
  assert.equal(pageUrl.pathname, "/fr_FR/inventory/new/my");
  assert.equal(pageUrl.searchParams.get("arrangeby"), "plh");
  assert.equal(pageUrl.searchParams.get("zip"), "92360");
  assert.equal(pageUrl.searchParams.get("range"), "0");

  const query = buildInventoryQuery(config);
  assert.equal(query.query.model, "my");
  assert.equal(query.query.condition, "new");
  assert.equal(query.query.zip, "92360");
  assert.equal(query.query.range, 0);
  assert.equal(query.outsideSearch, false);
});

test("accepts only the exact intercepted inventory request", () => {
  const expected = buildInventoryQuery(config);
  const url = `https://www.tesla.com/inventory/api/v4/inventory-results?query=${encodeURIComponent(JSON.stringify(expected))}`;
  assert.equal(isExpectedInventoryRequest(url, config), true);

  expected.query.condition = "used";
  const usedUrl = `https://www.tesla.com/inventory/api/v4/inventory-results?query=${encodeURIComponent(JSON.stringify(expected))}`;
  assert.equal(isExpectedInventoryRequest(usedUrl, config), false);
});

test("treats an authoritative empty Tesla API result as success", () => {
  assert.deepEqual(parseTeslaApiPayload({ results: [], total_matches_found: 0 }), []);
});

test("rejects malformed Tesla API payloads", () => {
  assert.throws(() => parseTeslaApiPayload({ error: "Access denied" }), /results array/);
});

test("normalizes a new Model Y API result", () => {
  const listing = parseTeslaApiListing({
    VIN: "XP7NEW123",
    TrimName: "Model Y Grande Autonomie",
    InventoryPrice: 46_990,
    Odometer: 15,
    Year: 2026,
    MetroName: "Paris",
    INTERIOR: ["Premium Black and White"],
    OptionCodeList: "$INPW0",
  });

  assert.equal(listing.vin, "XP7NEW123");
  assert.equal(listing.priceEur, 46_990);
  assert.equal(listing.odometerKm, 15);
  assert.equal(listing.whiteInterior, true);
  assert.match(listing.url, /titleStatus=new/);
});

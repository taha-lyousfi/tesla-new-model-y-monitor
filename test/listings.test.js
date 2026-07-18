import assert from "node:assert/strict";
import test from "node:test";
import { buildInventory } from "../src/listings.js";

test("keeps every unique new Model Y and sorts known prices first", () => {
  const listings = [
    { vin: "EXPENSIVE", priceEur: 52_000 },
    { vin: "UNKNOWN", priceEur: null },
    { vin: "CHEAP", priceEur: 45_000 },
    { vin: "CHEAP", priceEur: 45_000 },
  ];

  const result = buildInventory(listings, { topN: 20 });
  assert.deepEqual(result.eligible.map((listing) => listing.vin), [
    "CHEAP",
    "EXPENSIVE",
    "UNKNOWN",
  ]);
});

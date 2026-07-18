import assert from "node:assert/strict";
import test from "node:test";
import { scrapeInventory } from "../src/sources.js";

test("accepts an authoritative empty primary source without trying a fallback", async () => {
  let fallbackCalled = false;
  const result = await scrapeInventory({}, [
    { name: "primary", scrape: async () => [] },
    {
      name: "fallback",
      scrape: async () => {
        fallbackCalled = true;
        return [{ vin: "SHOULD_NOT_APPEAR" }];
      },
    },
  ]);

  assert.deepEqual(result.listings, []);
  assert.equal(fallbackCalled, false);
});

test("uses the second official route only after a verified failure", async () => {
  const result = await scrapeInventory({}, [
    { name: "page", scrape: async () => { throw new Error("Access Denied"); } },
    { name: "api", scrape: async () => [{ vin: "XP7NEW" }] },
  ]);

  assert.equal(result.source, "api");
  assert.equal(result.listings[0].vin, "XP7NEW");
  assert.match(result.previousErrors[0], /Access Denied/);
});

test("fails the cycle when every official route fails", async () => {
  await assert.rejects(
    scrapeInventory({}, [
      { name: "page", scrape: async () => { throw new Error("Access Denied"); } },
      { name: "api", scrape: async () => { throw new Error("HTTP 403"); } },
    ]),
    /All Tesla inventory routes failed/,
  );
});

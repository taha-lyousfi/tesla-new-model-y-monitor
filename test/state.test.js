import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { detectChanges, writeState } from "../src/state.js";

const listing = {
  vin: "XP7TEST",
  priceEur: 35_000,
  url: "https://example.test/XP7TEST",
};

test("detects a listing that was not present in the previous inventory", () => {
  assert.deepEqual(detectChanges([listing], { seen: {} }), [{ type: "new", listing }]);
});

test("detects a price drop but ignores an unchanged price", () => {
  const state = { seen: { XP7TEST: { priceEur: 36_000 } } };
  assert.equal(detectChanges([listing], state)[0].type, "price-drop");
  assert.equal(
    detectChanges([listing], { seen: { XP7TEST: { priceEur: 35_000 } } }).length,
    0,
  );
});

test("does not announce a previously seen VIN when it reappears", () => {
  const state = {
    active: {},
    seen: { XP7TEST: { priceEur: 35_000 } },
  };
  assert.equal(detectChanges([listing], state).length, 0);
});

test("persists seen VINs after they disappear from active inventory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tesla-monitor-state-"));
  const stateUrl = pathToFileURL(join(directory, "state.json"));
  try {
    await writeState(stateUrl, [], new Date("2026-07-18T20:00:00Z"), {
      version: 2,
      seen: { XP7TEST: { priceEur: 35_000, firstSeenAt: "2026-07-18T19:00:00Z" } },
    });
    const saved = JSON.parse(await readFile(stateUrl, "utf8"));
    assert.deepEqual(saved.active, {});
    assert.equal(saved.seen.XP7TEST.priceEur, 35_000);
    assert.equal(saved.seen.XP7TEST.firstSeenAt, "2026-07-18T19:00:00Z");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

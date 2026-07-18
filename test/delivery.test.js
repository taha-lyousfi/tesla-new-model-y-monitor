import assert from "node:assert/strict";
import test from "node:test";
import { deliverAndAdvance } from "../src/delivery.js";

test("does not advance seen state when an alert email fails", async () => {
  let persisted = false;
  const result = await deliverAndAdvance({
    changes: [{ type: "new" }],
    sendChanges: async () => ({ sent: false, reason: "SMTP unavailable" }),
    advanceState: async () => { persisted = true; },
  });

  assert.equal(result.advanced, false);
  assert.equal(persisted, false);
});

test("sends one batch and advances state only after success", async () => {
  let sends = 0;
  let persists = 0;
  const result = await deliverAndAdvance({
    changes: [{ type: "new" }, { type: "new" }],
    sendChanges: async () => { sends += 1; return { sent: true, messageId: "test" }; },
    advanceState: async () => { persists += 1; },
  });

  assert.equal(result.advanced, true);
  assert.equal(sends, 1);
  assert.equal(persists, 1);
});

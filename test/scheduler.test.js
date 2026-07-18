import assert from "node:assert/strict";
import test from "node:test";
import { retryDelayMinutes } from "../src/scheduler.js";

test("uses exponential retry delays with a configured cap", () => {
  const config = {
    checkIntervalMinutes: 5,
    retryDelayMinutes: 2,
    maxRetryDelayMinutes: 10,
  };

  assert.equal(retryDelayMinutes(config, 0), 5);
  assert.equal(retryDelayMinutes(config, 1), 2);
  assert.equal(retryDelayMinutes(config, 2), 4);
  assert.equal(retryDelayMinutes(config, 3), 8);
  assert.equal(retryDelayMinutes(config, 4), 10);
  assert.equal(retryDelayMinutes(config, 8), 10);
});

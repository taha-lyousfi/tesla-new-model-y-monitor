import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEnvFile,
  normalizeAppPassword,
  validateAppPassword,
  validateGmailAddress,
} from "../src/setup.js";

test("validates Gmail App Password input without storing spaces", () => {
  assert.equal(normalizeAppPassword("abcd efgh ijkl mnop"), "abcdefghijklmnop");
  assert.equal(validateAppPassword("abcd efgh ijkl mnop"), true);
  assert.equal(validateAppPassword("normal-google-password"), false);
  assert.equal(validateGmailAddress("fahd@example.com"), false);
  assert.equal(validateGmailAddress("fahd@gmail.com"), true);
});

test("builds a server environment with the exact new-inventory search", () => {
  const env = buildEnvFile({
    sender: "sender@gmail.com",
    recipient: "recipient@example.com",
    appPassword: "abcdefghijklmnop",
    intervalMinutes: 5,
  });

  assert.match(env, /^POSTAL_CODE=92360$/mu);
  assert.match(env, /^SEARCH_RANGE=0$/mu);
  assert.match(env, /^NOTIFY_ON_FIRST_RUN=true$/mu);
  assert.match(env, /^EMAIL_TO=recipient@example\.com$/mu);
  assert.doesNotMatch(env, /inventory\/used|dfmanme|92190/iu);
});

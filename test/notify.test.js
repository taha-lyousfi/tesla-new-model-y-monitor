import assert from "node:assert/strict";
import test from "node:test";
import { emailConfigured } from "../src/notify.js";

test("requires a password when SMTP authentication has a user", () => {
  const smtp = {
    host: "smtp.gmail.com",
    from: "monitor@example.com",
    to: "recipient@example.com",
    user: "monitor@example.com",
    password: "",
  };

  assert.equal(emailConfigured(smtp), false);
  assert.equal(emailConfigured({ ...smtp, password: "app-password" }), true);
});

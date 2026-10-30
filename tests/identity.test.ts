import { test } from "node:test";
import assert from "node:assert/strict";
import { loginEmail } from "../src/identity.ts";

test("usernames and email addresses use the same Firebase password sign-in flow", () => {
  assert.equal(loginEmail(" Alex "), "alex@rabbit.test");
  assert.equal(loginEmail(" New.Reader "), "new.reader@rabbit.test");
  assert.equal(loginEmail(" Reader@Example.com "), "reader@example.com");
  assert.throws(() => loginEmail("bad username"), /username or email/i);
  assert.throws(() => loginEmail("bad@"), /username or email/i);
});

test("username backfill plans all claims before writing and refuses ambiguous legacy handles", async () => {
  const { planUsernameClaims } = await import("../src/identity.ts");
  assert.deepEqual(
    planUsernameClaims([
      { id: "a", handle: "alice" },
      { id: "b", handle: "bob" },
    ]),
    [
      { handle: "alice", userId: "a" },
      { handle: "bob", userId: "b" },
    ],
  );
  assert.throws(
    () =>
      planUsernameClaims([
        { id: "a", handle: "alice" },
        { id: "b", handle: "alice" },
      ]),
    /duplicate.*alice/i,
  );
  assert.throws(
    () => planUsernameClaims([{ id: "a", handle: "Alice" }]),
    /invalid.*Alice/i,
  );
  assert.throws(
    () => planUsernameClaims([{ id: "a", handle: "bad+handle" }]),
    /invalid/i,
  );
});

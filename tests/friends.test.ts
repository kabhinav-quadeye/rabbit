import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/domain.ts";
import type { State } from "../src/types.ts";

const fixture = (): State => ({
  users: [
    {
      id: "alice",
      name: "Alice",
      handle: "alice",
      email: "private@example.com",
    },
    { id: "bob", name: "Robert", handle: "bob" },
    { id: "eve", name: "Eve", handle: "eve" },
  ],
  groups: [
    {
      id: "club",
      name: "Club",
      description: "",
      ownerId: "alice",
      memberIds: ["alice"],
      color: "sage",
      icon: "users",
    },
  ],
  posts: [],
});

test("legacy states start with no friends; group membership does not imply friendship", () => {
  const app = createService(fixture());
  assert.deepEqual(app.bootstrap("alice").friendIds, []);
  assert.deepEqual(app.bootstrap("alice").friendRequests, []);
  assert.throws(
    () => app.createGroup("alice", { name: "New", memberIds: ["bob"] }),
    /friends/i,
  );
  assert.throws(() => app.addMembers("alice", "club", ["bob"]), /friends/i);
  assert.deepEqual(app.bootstrap("alice").groups[0].memberIds, ["alice"]);
});

test("username discovery is case insensitive, ignores @, and excludes self and private emails", () => {
  const app = createService(fixture());
  assert.deepEqual(
    app.findUsers("alice", " @BO ").map((u) => u.id),
    ["bob"],
  );
  assert.deepEqual(app.findUsers("alice", "Robert"), []);
  assert.deepEqual(app.findUsers("alice", ""), []);
  assert.deepEqual(app.findUsers("alice", "alice"), []);
  assert.equal("email" in app.findUsers("bob", "alice")[0], false);
});

test("only the recipient can accept a request; acceptance persists mutual friendship and enables invites", () => {
  let saved: State | undefined;
  const app = createService(fixture(), (state) => {
    saved = state;
  });
  const request = app.sendFriendRequest("alice", "bob");
  assert.equal(request.status, "pending");
  assert.deepEqual(app.bootstrap("bob").friendRequests, [request]);
  assert.deepEqual(app.bootstrap("eve").friendRequests, []);
  assert.throws(
    () => app.respondToFriendRequest("alice", request.id, "accepted"),
    /recipient/i,
  );
  assert.throws(
    () => app.respondToFriendRequest("eve", request.id, "accepted"),
    /recipient/i,
  );
  assert.throws(() => app.addMembers("alice", "club", ["bob"]), /friends/i);
  app.respondToFriendRequest("bob", request.id, "accepted");
  assert.deepEqual(app.bootstrap("alice").friendIds, ["bob"]);
  assert.deepEqual(app.bootstrap("bob").friendIds, ["alice"]);
  assert.deepEqual(createService(saved!).bootstrap("bob").friendIds, ["alice"]);
  assert.deepEqual(app.addMembers("alice", "club", ["bob"]).memberIds, [
    "alice",
    "bob",
  ]);
  assert.deepEqual(
    app.createGroup("bob", { name: "Readers", memberIds: ["alice"] }).memberIds,
    ["bob", "alice"],
  );
});

test("requests reject self, unknown users, duplicate and reverse requests, and invalid transitions", () => {
  const app = createService(fixture());
  assert.throws(() => app.sendFriendRequest("alice", "alice"), /yourself/i);
  assert.throws(() => app.sendFriendRequest("alice", "missing"), /user/i);
  const request = app.sendFriendRequest("alice", "bob");
  assert.throws(() => app.sendFriendRequest("alice", "bob"), /pending/i);
  assert.throws(() => app.sendFriendRequest("bob", "alice"), /pending/i);
  assert.throws(
    () => app.respondToFriendRequest("bob", request.id, "forged" as any),
    /response/i,
  );
  app.respondToFriendRequest("bob", request.id, "declined");
  assert.deepEqual(app.bootstrap("bob").friendIds, []);
  assert.throws(
    () => app.respondToFriendRequest("bob", request.id, "accepted"),
    /pending/i,
  );
  const retry = app.sendFriendRequest("alice", "bob");
  app.respondToFriendRequest("bob", retry.id, "accepted");
  assert.throws(
    () => app.sendFriendRequest("alice", "bob"),
    /already friends/i,
  );
  assert.throws(
    () => app.respondToFriendRequest("bob", retry.id, "declined"),
    /pending/i,
  );
});

test("a member can add only their own friends and a mixed batch is rejected atomically", () => {
  const app = createService(fixture());
  const request = app.sendFriendRequest("alice", "bob");
  app.respondToFriendRequest("bob", request.id, "accepted");
  assert.throws(
    () => app.addMembers("alice", "club", ["bob", "eve"]),
    /friends/i,
  );
  assert.deepEqual(app.bootstrap("alice").groups[0].memberIds, ["alice"]);
  app.addMembers("alice", "club", ["bob"]);
  assert.throws(() => app.addMembers("bob", "club", ["eve"]), /friends/i);
  assert.deepEqual(app.addMembers("bob", "club", ["alice"]).memberIds, [
    "alice",
    "bob",
  ]);
});

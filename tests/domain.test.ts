import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../server/domain.ts";
import type { State } from "../src/types.ts";

const fixture = (): State => ({
  users: [
    { id: "alice", name: "Alice", handle: "alice" },
    { id: "bob", name: "Bob", handle: "bob" },
    { id: "eve", name: "Eve", handle: "eve" },
  ],
  groups: [
    {
      id: "design",
      name: "Design club",
      description: "Design ideas",
      memberIds: ["alice", "bob"],
      ownerId: "alice",
      color: "sage",
      icon: "palette",
    },
  ],
  friendRequests: [
    {
      id: "alice:bob",
      senderId: "alice",
      recipientId: "bob",
      status: "accepted",
    },
    { id: "bob:eve", senderId: "bob", recipientId: "eve", status: "accepted" },
  ],
  posts: [
    {
      id: "self",
      authorId: "alice",
      audienceType: "self",
      audienceId: "alice",
      title: "Personal typography notes",
      body: "Private checklist",
      tags: ["design"],
      createdAt: "2026-10-01T10:00:00Z",
      votes: [],
      savedBy: [],
      comments: [],
      type: "note",
    },
    {
      id: "direct",
      authorId: "bob",
      audienceType: "user",
      audienceId: "alice",
      title: "Typography resource",
      body: "Read the guide",
      tags: ["design"],
      createdAt: "2026-10-02T10:00:00Z",
      votes: [],
      savedBy: [],
      comments: [],
      type: "link",
    },
    {
      id: "shared",
      authorId: "alice",
      audienceType: "group",
      audienceId: "design",
      title: "A typography system",
      body: "Spacing and contrast",
      tags: ["design"],
      createdAt: "2026-10-03T10:00:00Z",
      votes: [],
      savedBy: [],
      comments: [],
      type: "note",
    },
    {
      id: "secret",
      authorId: "eve",
      audienceType: "self",
      audienceId: "eve",
      title: "Typography secret",
      body: "Not for others",
      tags: ["design"],
      createdAt: "2026-10-04T10:00:00Z",
      votes: [],
      savedBy: [],
      comments: [],
      type: "note",
    },
  ],
});

test("feed includes own notes, incoming direct posts and joined groups, newest first", () => {
  const app = createService(fixture());
  assert.deepEqual(
    app.bootstrap("alice").posts.map((p: any) => p.id),
    ["shared", "direct", "self"],
  );
  assert.deepEqual(
    app.bootstrap("eve").posts.map((p: any) => p.id),
    ["secret"],
  );
});
test("bootstrap does not reveal groups to nonmembers", () => {
  assert.deepEqual(createService(fixture()).bootstrap("eve").groups, []);
  assert.equal(createService(fixture()).bootstrap("alice").groups.length, 1);
});
test("self posting normalizes audience and tags, trims input and persists", () => {
  const app = createService(fixture());
  const p = app.createPost("alice", {
    audienceType: "self",
    audienceId: "eve",
    title: "  My note  ",
    body: "  useful  ",
    tags: ["Design", "design", "books"],
    type: "note",
  });
  assert.equal(p?.audienceId, "alice");
  assert.equal(p?.title, "My note");
  assert.deepEqual(p?.tags, ["design", "books"]);
  assert.equal(app.bootstrap("alice").posts[0]?.id, p?.id);
});
test("group posting rejects nonmembers and empty content", () => {
  const app = createService(fixture());
  assert.throws(
    () =>
      app.createPost("eve", {
        audienceType: "group",
        audienceId: "design",
        title: "Attack",
        body: "Secret",
      }),
    /member/i,
  );
  assert.throws(
    () =>
      app.createPost("alice", { audienceType: "self", title: " ", body: " " }),
    /title/i,
  );
});
test("direct posts are visible only to sender and recipient", () => {
  const app = createService(fixture());
  const p = app.createPost("alice", {
    audienceType: "user",
    audienceId: "bob",
    title: "For Bob",
    body: "A useful resource",
  });
  assert.ok(app.bootstrap("bob").posts.some((x: any) => x.id === p?.id));
  assert.ok(!app.bootstrap("eve").posts.some((x: any) => x.id === p?.id));
  assert.throws(
    () =>
      app.createPost("alice", {
        audienceType: "user",
        audienceId: "missing",
        title: "No one",
        body: "Hello",
      }),
    /user/i,
  );
});
test("search matches title, body and tags without leaking private posts", () => {
  const app = createService(fixture());
  assert.deepEqual(
    app.search("alice", "TYPOGRAPHY").map((p: any) => p.id),
    ["shared", "direct", "self"],
  );
  assert.deepEqual(
    app.search("bob", "contrast").map((p: any) => p.id),
    ["shared"],
  );
  assert.deepEqual(
    app.search("bob", "#design", "groups").map((p: any) => p.id),
    ["shared"],
  );
  assert.deepEqual(app.search("alice", "no result"), []);
});
test("group creation includes creator and invited friends exactly once", () => {
  const app = createService(fixture());
  const g = app.createGroup("alice", {
    name: "  Book club ",
    description: "Read together",
    memberIds: ["alice", "bob", "bob"],
  });
  assert.equal(g?.name, "Book club");
  assert.deepEqual(g?.memberIds, ["alice", "bob"]);
  assert.equal(app.bootstrap("bob").groups.length, 2);
});
test("any member can add their friends; nonmembers cannot add anyone", () => {
  const app = createService(fixture());
  assert.throws(() => app.addMembers("eve", "design", ["eve"]), /member/i);
  assert.throws(() => app.addMembers("alice", "design", ["unknown"]), /user/i);
  app.addMembers("bob", "design", ["eve"]);
  assert.ok(app.bootstrap("eve").posts.some((p: any) => p.id === "shared"));
});
test("saved and useful toggles persist and can be undone", () => {
  const app = createService(fixture());
  app.toggleSave("bob", "shared");
  app.toggleVote("bob", "shared");
  let p = app.bootstrap("bob").posts.find((p: any) => p.id === "shared");
  assert.deepEqual(p?.savedBy, ["bob"]);
  assert.deepEqual(p?.votes, ["bob"]);
  app.toggleSave("bob", "shared");
  app.toggleVote("bob", "shared");
  p = app.bootstrap("bob").posts.find((p: any) => p.id === "shared");
  assert.deepEqual(p?.savedBy, []);
  assert.deepEqual(p?.votes, []);
});
test("comments reject inaccessible posts and preserve real author and text", () => {
  const app = createService(fixture());
  assert.throws(() => app.addComment("eve", "shared", "Leak"), /access/i);
  assert.throws(() => app.addComment("bob", "shared", " "), /comment/i);
  app.addComment("bob", "shared", "  Thanks for this!  ");
  const p = app.bootstrap("alice").posts.find((p: any) => p.id === "shared");
  assert.equal(p?.comments[0]?.authorId, "bob");
  assert.equal(p?.comments[0]?.body, "Thanks for this!");
});
test("profile edits validate names and persist", () => {
  const app = createService(fixture());
  app.updateProfile("alice", { name: "Alice Chen", bio: "Always learning." });
  assert.equal(
    app.bootstrap("alice").users.find((u: any) => u.id === "alice")?.name,
    "Alice Chen",
  );
  assert.throws(() => app.updateProfile("alice", { name: " " }), /name/i);
});

test("search finds accessible posts by author and group name", () => {
  const app = createService(fixture());
  assert.deepEqual(
    app.search("bob", "Alice").map((p) => p.id),
    ["shared"],
  );
  assert.deepEqual(
    app.search("alice", "Design club").map((p) => p.id),
    ["shared"],
  );
  assert.deepEqual(app.search("eve", "Design club"), []);
});
test("malformed group member and tag inputs produce validation errors", () => {
  const app = createService(fixture());
  assert.throws(
    () =>
      app.createGroup("alice", { name: "Readers", memberIds: "bob" as any }),
    /members must be a list/i,
  );
  assert.throws(
    () =>
      app.createPost("alice", {
        title: "Note",
        body: "Useful",
        audienceType: "self",
        tags: [null] as any,
      }),
    /tag/i,
  );
});
test("search supports 'circles' scope alias for groups", () => {
  const app = createService(fixture());
  assert.deepEqual(
    app.search("bob", "#design", "circles").map((p: any) => p.id),
    ["shared"],
  );
});
test("circle creation validates circle name", () => {
  const app = createService(fixture());
  assert.throws(
    () => app.createGroup("alice", { name: "   " }),
    /circle name/i,
  );
});

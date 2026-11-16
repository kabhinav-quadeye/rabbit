import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/domain.ts";
import type { State } from "../src/types.ts";

const fixture = (): State => ({
  users: [
    { id: "alice", name: "Alice", handle: "alice" },
    { id: "bob", name: "Bob", handle: "bob" },
  ],
  groups: [],
  posts: Array.from({ length: 60 }, (_, i) => ({
    id: `p${String(i).padStart(3, "0")}`,
    authorId: i === 59 ? "bob" : "alice",
    audienceType: "self",
    audienceId: i === 59 ? "bob" : "alice",
    title: "Garden notes",
    body: i === 30 ? "Rare orchid" : "Common fern",
    tags: ["plants"],
    type: "note",
    createdAt: "2026-11-01T00:00:00Z",
    votes: [],
    savedBy: [],
    comments: [],
  })),
});

test("search pages bound candidate work, continue through empty filtered pages and never expose private posts", () => {
  const app = createService(fixture());
  const first = app.searchPage("alice", "garden orchid");
  assert.deepEqual(first.posts, []);
  assert.equal(first.nextCursor, "p024");
  const second = app.searchPage(
    "alice",
    "garden orchid",
    "all",
    first.nextCursor!,
  );
  assert.deepEqual(
    second.posts.map((p) => p.id),
    ["p030"],
  );
  assert.equal(second.nextCursor, "p049");
  const last = app.searchPage("alice", "garden", "all", second.nextCursor!);
  assert.equal(last.nextCursor, null);
  assert.equal(last.posts.length, 9);
});

test("index normalizes whole words, tags and Unicode; new posts and profile edits remain searchable", () => {
  const app = createService(fixture(), undefined, () => "new");
  assert.deepEqual(app.search("alice", "gard"), []);
  const post = app.createPost("alice", {
    audienceType: "self",
    title: "CAFÉ orchids",
    body: "A field guide",
    tags: ["Plants"],
  });
  assert.deepEqual(
    app.search("alice", "#plants café").map((p) => p.id),
    [post.id],
  );
  app.updateProfile("alice", { name: "Alicia", bio: "" });
  assert.equal(app.search("alice", "alicia café")[0]?.id, post.id);
  assert.equal(app.search("alice", "alice café")[0]?.id, post.id); // immutable handle stays searchable
});

test("search pages apply saved scope and current access checks", () => {
  const state = fixture();
  state.posts[0].savedBy = ["alice"];
  const app = createService(state);
  assert.deepEqual(
    app.searchPage("alice", "garden", "saved").posts.map((p) => p.id),
    ["p000"],
  );
  assert.deepEqual(app.searchPage("alice", "garden", "people").posts, []);
  assert.deepEqual(
    app.searchPage("bob", "garden").posts.map((p) => p.id),
    ["p059"],
  );
  assert.throws(() => app.searchPage("missing", "garden"), /user not found/i);
});

test("page scopes preserve direct shares and current circle membership", () => {
  const state = fixture();
  state.groups = [
    {
      id: "club",
      name: "Botanical circle",
      description: "",
      memberIds: ["alice"],
      ownerId: "alice",
      color: "sage",
      icon: "book",
    },
  ];
  state.posts = [
    {
      ...state.posts[0],
      id: "direct",
      authorId: "bob",
      audienceType: "user",
      audienceId: "alice",
      title: "Orchid guide",
    },
    {
      ...state.posts[0],
      id: "circle",
      audienceType: "group",
      audienceId: "club",
      title: "Orchid guide",
    },
    { ...state.posts[0], id: "note", title: "Orchid guide" },
  ];
  const app = createService(state);
  assert.deepEqual(
    app.searchPage("alice", "orchid", "people").posts.map((p) => p.id),
    ["direct"],
  );
  assert.deepEqual(
    app.searchPage("alice", "orchid", "personal").posts.map((p) => p.id),
    ["note"],
  );
  assert.deepEqual(
    app.searchPage("alice", "botanical", "circles").posts.map((p) => p.id),
    ["circle"],
  );
  assert.deepEqual(app.searchPage("bob", "orchid", "circles").posts, []);
});

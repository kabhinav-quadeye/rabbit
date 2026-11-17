import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../server/domain.ts";
import { momentum } from "../src/goals.ts";
import type { State } from "../src/types.ts";

// Alice and Bob are friends, Bob and Cara are friends, Eve knows nobody.
const base = (): State => ({
  users: ["alice", "bob", "cara", "eve"].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    handle: id,
  })),
  groups: [],
  posts: [],
  friendRequests: [
    {
      id: "alice:bob",
      senderId: "alice",
      recipientId: "bob",
      status: "accepted",
    },
    {
      id: "bob:cara",
      senderId: "bob",
      recipientId: "cara",
      status: "accepted",
    },
  ],
});
function setup(state = base()) {
  let n = 0,
    clock = Date.parse("2026-11-15T10:00:00.000Z");
  let saved: State | null = null;
  const app = createService(
    state,
    (next) => (saved = next),
    () => `id${++n}`,
    () => new Date((clock += 1000)),
  );
  return { app, saved: () => saved! };
}

test("a goal can be shared with friends while it is created", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Trip", memberIds: ["bob"] });
  assert.deepEqual(g.memberIds, ["alice", "bob"]);
  assert.deepEqual(
    app.goalsOverview("bob").goals.map((x) => x.id),
    [g.id],
  );
  const solo = app.createGoal("alice", { title: "Solo" });
  assert.deepEqual(solo.memberIds, ["alice"]);
  assert.throws(
    () => app.createGoal("alice", { title: "x", memberIds: ["eve"] }),
    /friends/i,
  );
  assert.throws(
    () => app.createGoal("alice", { title: "x", memberIds: ["ghost"] }),
    /not found/i,
  );
});

test("sharing an existing goal shares all of its tasks, old and new", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const [old] = app.createTask("alice", g.id, { description: "Dig beds" });
  app.completeTask("alice", old.id, false);
  assert.deepEqual(app.goalsOverview("bob"), { goals: [], tasks: [] });

  const shared = app.shareGoal("alice", g.id, ["bob"]);
  assert.deepEqual(shared.memberIds, ["alice", "bob"]);
  const [fresh] = app.createTask("alice", g.id, { description: "Plant" });
  const view = app.goalsOverview("bob");
  assert.deepEqual(
    view.goals.map((x) => x.id),
    [g.id],
  );
  assert.deepEqual(
    view.tasks.map((t) => [t.description, t.status]),
    [
      ["Dig beds", "done"],
      ["Plant", "open"],
    ],
  );
  assert.equal(fresh.ownerId, "alice");
  assert.throws(() => app.shareGoal("alice", g.id, ["eve"]), /friends/i);
  assert.throws(() => app.shareGoal("eve", g.id, ["eve"]), /not found/i);
  assert.throws(() => app.shareGoal("alice", g.id, []), /at least one/i);
});

test("legacy goals without memberIds belong to their owner only", () => {
  const state = base();
  state.goals = [
    {
      id: "old",
      ownerId: "alice",
      title: "Old goal",
      why: "",
      color: "sage",
      icon: "flag",
      targetDate: null,
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      reachedAt: null,
    },
  ];
  const { app } = setup(state);
  assert.equal(app.goalsOverview("alice").goals.length, 1);
  assert.equal(app.goalsOverview("bob").goals.length, 0);
  assert.deepEqual(app.shareGoal("alice", "old", ["bob"]).memberIds, [
    "alice",
    "bob",
  ]);
});

test("members collaborate on tasks and see who completed them", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Trip", memberIds: ["bob"] });
  const [parent] = app.createTask("bob", g.id, { description: "Book" });
  const [child] = app.createTask("alice", g.id, {
    description: "Flights",
    parentId: parent.id,
  });
  assert.equal(parent.ownerId, "alice", "tasks belong to the goal's owner");
  assert.equal(
    app.updateTask("bob", child.id, { notes: "Window" }).notes,
    "Window",
  );
  const done = app.completeTask("bob", parent.id, true);
  assert.deepEqual(
    done.map((t) => t.completedBy),
    ["bob", "bob"],
  );
  const reopened = app.reopenTask("alice", child.id);
  assert.ok(reopened.every((t) => t.completedBy === null));
  app.deleteTask("bob", child.id);
  assert.deepEqual(
    app.goalsOverview("alice").tasks.map((t) => t.id),
    [parent.id],
  );
  assert.throws(
    () => app.createTask("eve", g.id, { description: "Intrude" }),
    /not found/i,
  );
  assert.throws(() => app.completeTask("eve", parent.id, true), /not found/i);
});

test("only the owner changes goal settings or deletes it", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Trip", memberIds: ["bob"] });
  assert.throws(() => app.updateGoal("bob", g.id, { title: "Mine" }), /owner/i);
  assert.throws(() => app.deleteGoal("bob", g.id), /owner/i);
  // Settings updates never change who is in the goal.
  const edited = app.updateGoal("alice", g.id, {
    title: "Big trip",
    memberIds: ["alice"],
  } as any);
  assert.deepEqual(edited.memberIds, ["alice", "bob"]);
  assert.equal(app.goalsOverview("bob").goals[0].title, "Big trip");
});

test("members invite their own friends, like circles", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Trip", memberIds: ["bob"] });
  assert.deepEqual(app.shareGoal("bob", g.id, ["cara"]).memberIds, [
    "alice",
    "bob",
    "cara",
  ]);
  assert.throws(() => app.shareGoal("cara", g.id, ["eve"]), /friends/i);
});

test("a member can leave and the owner can remove people", () => {
  const { app } = setup();
  const g = app.createGoal("alice", {
    title: "Trip",
    memberIds: ["bob"],
  });
  app.shareGoal("bob", g.id, ["cara"]);
  assert.throws(() => app.removeGoalMember("bob", g.id, "cara"), /owner/i);
  assert.deepEqual(app.removeGoalMember("cara", g.id, "cara").memberIds, [
    "alice",
    "bob",
  ]);
  assert.equal(app.goalsOverview("cara").goals.length, 0);
  assert.throws(() => app.removeGoalMember("cara", g.id, "cara"), /not found/i);
  assert.deepEqual(app.removeGoalMember("alice", g.id, "bob").memberIds, [
    "alice",
  ]);
  assert.throws(() => app.removeGoalMember("alice", g.id, "alice"), /owner/i);
});

test("momentum counts only the viewer's own completions", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Trip", memberIds: ["bob"] });
  const [a] = app.createTask("alice", g.id, { description: "A" });
  const [b] = app.createTask("alice", g.id, { description: "B" });
  app.completeTask("alice", a.id, false);
  app.completeTask("bob", b.id, false);
  const { tasks } = app.goalsOverview("alice");
  const now = new Date("2026-11-15T12:00:00.000Z");
  assert.equal(momentum(tasks, now, "alice").completed, 1);
  assert.equal(momentum(tasks, now, "bob").completed, 1);
  assert.equal(momentum(tasks, now).completed, 2);
  // Tasks completed before sharing existed count for the goal's owner.
  const legacy = { ...tasks[0], completedBy: undefined };
  assert.equal(momentum([legacy], now, "alice").completed, 1);
});

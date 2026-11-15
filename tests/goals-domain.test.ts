import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../server/domain.ts";
import type { State } from "../src/types.ts";

const base = (): State => ({
  users: [
    { id: "alice", name: "Alice", handle: "alice" },
    { id: "eve", name: "Eve", handle: "eve" },
  ],
  groups: [],
  posts: [],
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

test("legacy state without goals loads and returns an empty overview", () => {
  const { app } = setup();
  assert.deepEqual(app.goalsOverview("alice"), { goals: [], tasks: [] });
});

test("creating a goal validates and normalizes input and persists it", () => {
  const { app, saved } = setup();
  const g = app.createGoal("alice", {
    title: "  Run a half marathon ",
    why: " Prove I can train ",
    color: "lavender",
    icon: "run",
    targetDate: "2027-04-12",
  });
  assert.equal(g.title, "Run a half marathon");
  assert.equal(g.why, "Prove I can train");
  assert.equal(g.ownerId, "alice");
  assert.equal(g.status, "active");
  assert.deepEqual(
    saved().goals?.map((x) => x.id),
    [g.id],
  );
  const fallback = app.createGoal("alice", {
    title: "Read",
    color: "neon" as any,
    icon: "rocket" as any,
  });
  assert.equal(fallback.color, "sage");
  assert.equal(fallback.icon, "flag");
  assert.equal(fallback.targetDate, null);
  assert.throws(() => app.createGoal("alice", { title: "  " }), /title/i);
  assert.throws(
    () => app.createGoal("alice", { title: "x".repeat(121) }),
    /120/,
  );
  assert.throws(
    () => app.createGoal("alice", { title: "Bad", targetDate: "2027-13-40" }),
    /date/i,
  );
});

test("goals and tasks are private to their owner", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Secret goal" });
  const [t] = app.createTask("alice", g.id, { description: "Step" });
  assert.deepEqual(app.goalsOverview("eve"), { goals: [], tasks: [] });
  assert.throws(
    () => app.updateGoal("eve", g.id, { title: "Mine" }),
    /not found/i,
  );
  assert.throws(() => app.deleteGoal("eve", g.id), /not found/i);
  assert.throws(
    () => app.createTask("eve", g.id, { description: "Intrude" }),
    /not found/i,
  );
  assert.throws(
    () => app.updateTask("eve", t.id, { notes: "x" }),
    /not found/i,
  );
  assert.throws(() => app.completeTask("eve", t.id, true), /not found/i);
  assert.throws(() => app.reopenTask("eve", t.id), /not found/i);
  assert.throws(() => app.deleteTask("eve", t.id), /not found/i);
});

test("tasks nest under the goal or a parent in the same goal, up to four levels", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const other = app.createGoal("alice", { title: "Other" });
  const [root] = app.createTask("alice", g.id, {
    description: "  Plan beds ",
    priority: "high",
    dueDate: "2026-11-20",
  });
  assert.equal(root.description, "Plan beds");
  assert.equal(root.depth, 0);
  assert.equal(root.parentId, null);
  assert.equal(root.priority, "high");
  const [l1] = app.createTask("alice", g.id, {
    description: "a",
    parentId: root.id,
  });
  const [l2] = app.createTask("alice", g.id, {
    description: "b",
    parentId: l1.id,
  });
  const [l3] = app.createTask("alice", g.id, {
    description: "c",
    parentId: l2.id,
  });
  assert.equal(l3.depth, 3);
  assert.throws(
    () => app.createTask("alice", g.id, { description: "d", parentId: l3.id }),
    /levels/i,
  );
  assert.throws(
    () =>
      app.createTask("alice", other.id, {
        description: "x",
        parentId: root.id,
      }),
    /same goal/i,
  );
  assert.throws(
    () => app.createTask("alice", g.id, { description: " " }),
    /description/i,
  );
  assert.throws(
    () =>
      app.createTask("alice", g.id, {
        description: "x",
        priority: "urgent" as any,
      }),
    /priority/i,
  );
});

test("updating a task changes only editable fields", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const [t] = app.createTask("alice", g.id, { description: "Dig" });
  const updated = app.updateTask("alice", t.id, {
    notes: "Use the long spade",
    priority: "medium",
    dueDate: null,
    goalId: "elsewhere",
    parentId: "x",
    status: "done",
  } as any);
  assert.equal(updated.notes, "Use the long spade");
  assert.equal(updated.priority, "medium");
  assert.equal(updated.goalId, g.id);
  assert.equal(updated.parentId, null);
  assert.equal(updated.status, "open");
  assert.ok(updated.updatedAt > t.updatedAt);
  assert.throws(
    () => app.updateTask("alice", t.id, { notes: "x".repeat(10001) }),
    /10000/,
  );
});

test("completing a task with open sub-tasks requires cascade, then completes the branch", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const [parent] = app.createTask("alice", g.id, { description: "Beds" });
  const [a] = app.createTask("alice", g.id, {
    description: "a",
    parentId: parent.id,
  });
  const [b] = app.createTask("alice", g.id, {
    description: "b",
    parentId: parent.id,
  });
  app.completeTask("alice", a.id, false);
  assert.throws(
    () => app.completeTask("alice", parent.id, false),
    (e: any) => e.status === 409 && /1 open sub-task/.test(e.message),
  );
  const changed = app.completeTask("alice", parent.id, true);
  assert.deepEqual(changed.map((t) => t.id).sort(), [b.id, parent.id].sort());
  assert.ok(changed.every((t) => t.status === "done" && t.completedAt));
  const tasks = app.goalsOverview("alice").tasks;
  assert.ok(tasks.every((t) => t.status === "done"));
});

test("reopening a task reopens its completed ancestors, and adding work under a done task reopens it", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const [parent] = app.createTask("alice", g.id, { description: "Beds" });
  const [child] = app.createTask("alice", g.id, {
    description: "a",
    parentId: parent.id,
  });
  const [grandchild] = app.createTask("alice", g.id, {
    description: "b",
    parentId: child.id,
  });
  app.completeTask("alice", parent.id, true);
  const reopened = app.reopenTask("alice", grandchild.id);
  assert.deepEqual(
    reopened.map((t) => t.id).sort(),
    [parent.id, child.id, grandchild.id].sort(),
  );
  assert.ok(
    reopened.every((t) => t.status === "open" && t.completedAt === null),
  );
  app.completeTask("alice", parent.id, true);
  const created = app.createTask("alice", g.id, {
    description: "c",
    parentId: child.id,
  });
  assert.equal(created[0].status, "open");
  assert.deepEqual(
    created
      .slice(1)
      .map((t) => t.id)
      .sort(),
    [parent.id, child.id].sort(),
  );
});

test("deleting a task removes its subtree; deleting a goal removes all its tasks", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const keep = app.createGoal("alice", { title: "Keep" });
  const [parent] = app.createTask("alice", g.id, { description: "Beds" });
  const [child] = app.createTask("alice", g.id, {
    description: "a",
    parentId: parent.id,
  });
  app.createTask("alice", g.id, { description: "b", parentId: child.id });
  const [sibling] = app.createTask("alice", g.id, { description: "Water" });
  const [kept] = app.createTask("alice", keep.id, { description: "Stay" });
  assert.equal(app.deleteTask("alice", parent.id).ids.length, 3);
  assert.deepEqual(
    app
      .goalsOverview("alice")
      .tasks.map((t) => t.id)
      .sort(),
    [sibling.id, kept.id].sort(),
  );
  const removed = app.deleteGoal("alice", g.id);
  assert.deepEqual(removed.taskIds, [sibling.id]);
  assert.deepEqual(
    app.goalsOverview("alice").goals.map((x) => x.id),
    [keep.id],
  );
  assert.deepEqual(
    app.goalsOverview("alice").tasks.map((t) => t.id),
    [kept.id],
  );
});

test("goal status changes record when a goal was reached", () => {
  const { app } = setup();
  const g = app.createGoal("alice", { title: "Garden" });
  const reached = app.updateGoal("alice", g.id, { status: "reached" });
  assert.ok(reached.reachedAt);
  const active = app.updateGoal("alice", g.id, { status: "active" });
  assert.equal(active.reachedAt, null);
  assert.throws(
    () => app.updateGoal("alice", g.id, { status: "deleted" as any }),
    /status/i,
  );
});

test("goal and task counts are capped", () => {
  const { app } = setup();
  for (let i = 0; i < 50; i++) app.createGoal("alice", { title: `Goal ${i}` });
  assert.throws(() => app.createGoal("alice", { title: "One more" }), /50/);
  const first = app.goalsOverview("alice").goals[0];
  app.updateGoal("alice", first.id, { status: "archived" });
  assert.ok(app.createGoal("alice", { title: "Now fits" }));
});

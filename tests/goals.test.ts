import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextTasks,
  goalProgress,
  momentum,
  childrenOf,
  descendants,
  orderGoals,
  localDate,
} from "../src/goals.ts";
import type { Goal, GoalTask } from "../src/types.ts";

let seq = 0;
const task = (over: Partial<GoalTask> & { id: string }): GoalTask => ({
  ownerId: "alice",
  goalId: "g1",
  parentId: null,
  depth: 0,
  description: over.id,
  notes: "",
  priority: "none",
  dueDate: null,
  status: "open",
  createdAt: `2026-11-01T10:00:${String(seq++).padStart(2, "0")}.000Z`,
  updatedAt: "2026-11-01T10:00:00.000Z",
  completedAt: null,
  ...over,
});
const goal = (over: Partial<Goal> & { id: string }): Goal => ({
  ownerId: "alice",
  title: over.id,
  why: "",
  color: "sage",
  icon: "flag",
  targetDate: null,
  status: "active",
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-01T09:00:00.000Z",
  reachedAt: null,
  ...over,
});

test("next tasks are open leaves only; a parent with all children done becomes actionable", () => {
  const tasks = [
    task({ id: "parent" }),
    task({ id: "child", parentId: "parent", depth: 1 }),
    task({ id: "doneParent" }),
    task({
      id: "doneChild",
      parentId: "doneParent",
      depth: 1,
      status: "done",
      completedAt: "2026-11-02T10:00:00.000Z",
    }),
    task({
      id: "finished",
      status: "done",
      completedAt: "2026-11-02T10:00:00.000Z",
    }),
    task({ id: "otherGoal", goalId: "g2" }),
  ];
  assert.deepEqual(
    nextTasks(tasks, "g1").map((t) => t.id),
    ["child", "doneParent"],
  );
});

test("next tasks sort by priority, then due date (undated last), then creation, capped by limit", () => {
  const tasks = [
    task({ id: "lowOld", priority: "low" }),
    task({ id: "noneDated", dueDate: "2026-11-03" }),
    task({ id: "highLate", priority: "high", dueDate: "2026-12-01" }),
    task({ id: "highSoon", priority: "high", dueDate: "2026-11-20" }),
    task({ id: "highUndated", priority: "high" }),
    task({ id: "medium", priority: "medium" }),
    task({ id: "noneOld" }),
    task({ id: "noneNew" }),
  ];
  assert.deepEqual(
    nextTasks(tasks, "g1").map((t) => t.id),
    [
      "highSoon",
      "highLate",
      "highUndated",
      "medium",
      "lowOld",
      "noneDated",
      "noneOld",
      "noneNew",
    ],
  );
  assert.deepEqual(
    nextTasks(tasks, "g1", 3).map((t) => t.id),
    ["highSoon", "highLate", "highUndated"],
  );
});

test("children keep creation order and descendants cover the whole branch", () => {
  const tasks = [
    task({ id: "a" }),
    task({ id: "a2", parentId: "a", depth: 1 }),
    task({
      id: "a1",
      parentId: "a",
      depth: 1,
      createdAt: "2026-10-01T00:00:00.000Z",
    }),
    task({ id: "a1x", parentId: "a1", depth: 2 }),
    task({ id: "b" }),
  ];
  assert.deepEqual(
    childrenOf(tasks, "g1", "a").map((t) => t.id),
    ["a1", "a2"],
  );
  assert.deepEqual(
    childrenOf(tasks, "g1", null).map((t) => t.id),
    ["a", "b"],
  );
  assert.deepEqual(
    descendants(tasks, "a")
      .map((t) => t.id)
      .sort(),
    ["a1", "a1x", "a2"],
  );
});

test("goal progress counts every task of the goal", () => {
  const tasks = [
    task({ id: "a", status: "done", completedAt: "2026-11-02T00:00:00.000Z" }),
    task({ id: "b" }),
    task({ id: "c", goalId: "g2" }),
  ];
  assert.deepEqual(goalProgress(tasks, "g1"), { done: 1, total: 2 });
});

test("momentum counts tasks and distinct goals completed in the last 7 local days", () => {
  const now = new Date(2026, 10, 15, 18, 0); // 15 Nov, local time
  const at = (day: number, hour = 12) =>
    new Date(2026, 10, day, hour).toISOString();
  const done = (id: string, goalId: string, day: number, hour?: number) =>
    task({ id, goalId, status: "done", completedAt: at(day, hour) });
  const tasks = [
    done("today", "g1", 15),
    done("today2", "g2", 15),
    done("firstDay", "g3", 9, 0), // start of the 7-day window
    done("tooOld", "g1", 8, 23), // previous week
    done("prev", "g1", 2), // previous week, first day
    done("ancient", "g1", 1, 12), // before the previous week
    task({ id: "open" }),
  ];
  const m = momentum(tasks, now);
  assert.equal(m.completed, 3);
  assert.equal(m.goals, 3);
  assert.equal(m.previous, 2);
  assert.equal(m.days.length, 7);
  assert.equal(m.days[0].date, "2026-11-09");
  assert.equal(m.days[6].date, "2026-11-15");
  assert.deepEqual(
    m.days.map((d) => d.count),
    [1, 0, 0, 0, 0, 0, 2],
  );
  assert.equal(localDate(now), "2026-11-15");
});

test("goals order by most recent activity, including their tasks", () => {
  const goals = [
    goal({ id: "quiet", updatedAt: "2026-11-01T00:00:00.000Z" }),
    goal({ id: "busy", updatedAt: "2026-11-01T00:00:00.000Z" }),
    goal({ id: "edited", updatedAt: "2026-11-05T00:00:00.000Z" }),
  ];
  const tasks = [
    task({ id: "t", goalId: "busy", updatedAt: "2026-11-10T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    orderGoals(goals, tasks).map((g) => g.id),
    ["busy", "edited", "quiet"],
  );
});

test("due labels read naturally relative to today", async () => {
  const { dueLabel, formatDate, daysUntil } = await import("../src/goals.ts");
  const today = new Date(2026, 10, 15, 21, 30); // Sun 15 Nov 2026
  assert.deepEqual(dueLabel("2026-11-14", today), {
    text: "Overdue · 14 Nov",
    overdue: true,
  });
  assert.equal(dueLabel("2026-11-15", today).text, "Due today");
  assert.equal(dueLabel("2026-11-16", today).text, "Due tomorrow");
  assert.equal(dueLabel("2026-11-20", today).text, "Due Fri");
  assert.equal(dueLabel("2026-12-01", today).text, "Due 1 Dec");
  assert.equal(dueLabel("2027-04-12", today).text, "Due 12 Apr 2027");
  assert.equal(formatDate("2026-11-20"), "Fri 20 Nov 2026");
  assert.equal(daysUntil("2026-11-25", today), 10);
});

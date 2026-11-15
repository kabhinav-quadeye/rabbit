// Pure goal selectors shared by every backend, the UI and tests. No I/O.
import type { Goal, GoalTask, Priority } from "./types.ts";

export const priorityRank: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};
export const MAX_DEPTH = 3; // four visible levels: depth 0–3
export const HOME_LIMIT = 3;

const byCreation = (a: GoalTask, b: GoalTask) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Direct children of a parent (or of the goal when parentId is null), oldest first. */
export function childrenOf(
  tasks: GoalTask[],
  goalId: string,
  parentId: string | null,
) {
  return tasks
    .filter((t) => t.goalId === goalId && t.parentId === parentId)
    .sort(byCreation);
}

export function descendants(tasks: GoalTask[], id: string): GoalTask[] {
  const result: GoalTask[] = [];
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const t of tasks)
      if (t.parentId === current) {
        result.push(t);
        queue.push(t.id);
      }
  }
  return result;
}

export function ancestors(tasks: GoalTask[], task: GoalTask): GoalTask[] {
  const result: GoalTask[] = [];
  let parentId = task.parentId;
  while (parentId) {
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent || result.includes(parent)) break;
    result.push(parent);
    parentId = parent.parentId;
  }
  return result;
}

export const openDescendants = (tasks: GoalTask[], id: string) =>
  descendants(tasks, id).filter((t) => t.status === "open");

export function compareNext(a: GoalTask, b: GoalTask) {
  return (
    priorityRank[a.priority] - priorityRank[b.priority] ||
    (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") ||
    byCreation(a, b)
  );
}

/** Open tasks with no open children, ranked by priority, due date, then age. */
export function nextTasks(tasks: GoalTask[], goalId: string, limit = Infinity) {
  const hasOpenChild = new Set(
    tasks
      .filter((t) => t.goalId === goalId && t.status === "open" && t.parentId)
      .map((t) => t.parentId),
  );
  return tasks
    .filter(
      (t) =>
        t.goalId === goalId && t.status === "open" && !hasOpenChild.has(t.id),
    )
    .sort(compareNext)
    .slice(0, limit);
}

export function goalProgress(tasks: GoalTask[], goalId: string) {
  const own = tasks.filter((t) => t.goalId === goalId);
  return {
    done: own.filter((t) => t.status === "done").length,
    total: own.length,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date for a Date, YYYY-MM-DD. */
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Parse YYYY-MM-DD as a local calendar date. */
export const parseDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Completed work in the last 7 local days (today included) and the 7 before. */
export function momentum(tasks: GoalTask[], now: Date) {
  const start = addDays(now, -6),
    previousStart = addDays(now, -13);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date: localDate(date), weekday: date.getDay(), count: 0 };
  });
  const goals = new Set<string>();
  let completed = 0,
    previous = 0;
  for (const t of tasks) {
    if (t.status !== "done" || !t.completedAt) continue;
    const when = new Date(t.completedAt);
    if (when >= start && when <= now) {
      completed++;
      goals.add(t.goalId);
      const day = days.find((d) => d.date === localDate(when));
      if (day) day.count++;
    } else if (when >= previousStart && when < start) previous++;
  }
  return { completed, goals: goals.size, previous, days };
}

/** Most recently active goals first (goal edits or any task change). */
export function orderGoals(goals: Goal[], tasks: GoalTask[]) {
  const activity = new Map(goals.map((g) => [g.id, g.updatedAt]));
  for (const t of tasks) {
    const current = activity.get(t.goalId);
    if (current !== undefined && t.updatedAt > current)
      activity.set(t.goalId, t.updatedAt);
  }
  return [...goals].sort(
    (a, b) =>
      activity.get(b.id)!.localeCompare(activity.get(a.id)!) ||
      (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monthName = (month: number) => MONTHS[month];

/** Whole calendar days from today to a YYYY-MM-DD date (negative when past). */
export const daysUntil = (value: string, today: Date) =>
  Math.round(
    (parseDate(value).getTime() -
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime()) /
      86400000,
  );

/** "Fri 20 Nov 2026" */
export function formatDate(value: string) {
  const d = parseDate(value);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Short, relative due label; the year appears only when it differs from today's. */
export function dueLabel(value: string, today: Date) {
  const d = parseDate(value),
    days = daysUntil(value, today);
  const short = `${d.getDate()} ${MONTHS[d.getMonth()]}${
    d.getFullYear() === today.getFullYear() ? "" : ` ${d.getFullYear()}`
  }`;
  if (days < 0) return { text: `Overdue · ${short}`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  if (days < 7) return { text: `Due ${WEEKDAYS[d.getDay()]}`, overdue: false };
  return { text: `Due ${short}`, overdue: false };
}

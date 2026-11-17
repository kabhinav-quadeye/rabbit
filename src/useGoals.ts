import { useCallback, useEffect, useState } from "react";
import { request } from "./api";
import { HOME_LIMIT, momentum, nextTasks } from "./goals";
import type {
  Goal,
  GoalInput,
  GoalTask,
  GoalsOverview,
  TaskInput,
} from "./types";

const upsert = <T extends { id: string }>(list: T[], changed: T[]) => {
  const byId = new Map(changed.map((x) => [x.id, x]));
  const merged = list.map((x) => byId.get(x.id) ?? x);
  for (const x of changed) if (!list.some((y) => y.id === x.id)) merged.push(x);
  return merged;
};
const snapshotOf = (data: GoalsOverview) =>
  Object.fromEntries(
    data.goals.map((g) => [
      g.id,
      nextTasks(data.tasks, g.id, HOME_LIMIT).map((t) => t.id),
    ]),
  );

/**
 * Goals state for the Goals tab. Home renders a snapshot of "up next" ids taken
 * at the last refresh, so completed rows stay put (struck through, with undo)
 * until the person asks for the next tasks. Pending changes drive the Refresh badge.
 */
export function useGoals(me?: string) {
  const [data, setData] = useState<GoalsOverview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [snapshot, setSnapshot] = useState<Record<string, string[]>>({}),
    [stats, setStats] = useState<ReturnType<typeof momentum> | null>(null),
    [pending, setPending] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await request<GoalsOverview>("/goals");
      setData(next);
      setSnapshot(snapshotOf(next));
      setStats(momentum(next.tasks, new Date(), me));
      setPending([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [me]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Re-rank Home from local data, e.g. when returning from a goal page. */
  const resnapshot = () => {
    if (!data) return;
    setSnapshot(snapshotOf(data));
    setStats(momentum(data.tasks, new Date(), me));
    setPending([]);
  };
  const mergeTasks = (changed: GoalTask[]) =>
    setData((d) => d && { ...d, tasks: upsert(d.tasks, changed) });
  const mergeGoal = (goal: Goal) =>
    setData((d) => d && { ...d, goals: upsert(d.goals, [goal]) });
  const dropGoal = (id: string) =>
    setData(
      (d) =>
        d && {
          goals: d.goals.filter((g) => g.id !== id),
          tasks: d.tasks.filter((t) => t.goalId !== id),
        },
    );
  const markPending = (id: string) =>
    setPending((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  return {
    data,
    loading,
    error,
    snapshot,
    stats,
    pending,
    refresh,
    resnapshot,
    async createGoal(input: GoalInput) {
      const goal = await request<Goal>("/goals", "POST", input);
      mergeGoal(goal);
      setSnapshot((s) => ({ ...s, [goal.id]: [] }));
      return goal;
    },
    async updateGoal(id: string, input: GoalInput) {
      const goal = await request<Goal>(`/goals/${id}`, "PATCH", input);
      mergeGoal(goal);
      return goal;
    },
    async deleteGoal(id: string) {
      await request(`/goals/${id}`, "DELETE");
      dropGoal(id);
    },
    /** Shares the goal, with its whole history, with more friends. */
    async shareGoal(id: string, memberIds: string[]) {
      const goal = await request<Goal>(`/goals/${id}/members`, "POST", {
        memberIds,
      });
      mergeGoal(goal);
      return goal;
    },
    /** Removes someone; when it is the viewer, they have left the goal. */
    async removeMember(id: string, userId: string) {
      const goal = await request<Goal>(
        `/goals/${id}/members/${encodeURIComponent(userId)}`,
        "DELETE",
      );
      if (userId === me) dropGoal(id);
      else mergeGoal(goal);
      return goal;
    },
    async createTask(goalId: string, input: TaskInput) {
      const changed = await request<GoalTask[]>(
        `/goals/${goalId}/tasks`,
        "POST",
        input,
      );
      mergeTasks(changed);
      // Show new top-level work on Home right away; ranking waits for Refresh.
      if (!input.parentId)
        setSnapshot((s) => ({
          ...s,
          [goalId]: [...(s[goalId] ?? []), changed[0].id],
        }));
      return changed[0];
    },
    async updateTask(id: string, input: TaskInput) {
      const task = await request<GoalTask>(`/tasks/${id}`, "PATCH", input);
      mergeTasks([task]);
      return task;
    },
    async completeTask(id: string, cascade: boolean) {
      const changed = await request<GoalTask[]>(
        `/tasks/${id}/complete`,
        "POST",
        { cascade },
      );
      mergeTasks(changed);
      markPending(id);
      return changed;
    },
    async reopenTask(id: string) {
      const changed = await request<GoalTask[]>(
        `/tasks/${id}/reopen`,
        "POST",
        {},
      );
      mergeTasks(changed);
      markPending(id);
      return changed;
    },
    async deleteTask(id: string) {
      const { ids } = await request<{ ids: string[] }>(
        `/tasks/${id}`,
        "DELETE",
      );
      setData(
        (d) => d && { ...d, tasks: d.tasks.filter((t) => !ids.includes(t.id)) },
      );
      return ids;
    },
  };
}
export type GoalsApi = ReturnType<typeof useGoals>;

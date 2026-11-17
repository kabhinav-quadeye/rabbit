import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  Sprout,
} from "lucide-react-native";
import { colors as c, tones, fonts, s } from "./theme";
import { Action } from "./ui";
import { Sheet } from "./Sheet";
import {
  Checkbox,
  Confirm,
  GoalMark,
  ProgressBar,
  QuickAdd,
  TaskMeta,
} from "./GoalParts";
import { GoalPage, taskLabel, type GoalMenuAction } from "./GoalPage";
import { GoalForm } from "./GoalForm";
import { TaskDetail, TaskTrail } from "./TaskDetail";
import {
  WEEKDAYS,
  ancestors,
  dueLabel,
  goalProgress,
  openDescendants,
  orderGoals,
  parseDate,
  localDate,
  formatDate,
} from "./goals";
import { useGoals, type GoalsApi } from "./useGoals";
import {
  GoalPeopleSheet,
  SharedWith,
  peopleOf,
  personName,
  type GoalPeople,
} from "./GoalPeople";
import type { Bootstrap, Goal, GoalTask } from "./types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Momentum({ stats }: { stats: NonNullable<GoalsApi["stats"]> }) {
  const max = Math.max(1, ...stats.days.map((d) => d.count));
  const delta = stats.completed - stats.previous;
  const lead = stats.completed
    ? `You completed ${plural(stats.completed, "task")} across ${plural(stats.goals, "goal")} in the last 7 days.`
    : "A fresh week. Finish one small task to get moving.";
  const follow = !stats.completed
    ? ""
    : delta > 0
      ? `${delta} more than the week before. Keep it going.`
      : delta === 0
        ? "Same pace as last week. Steady wins."
        : "Your next step is below.";
  return (
    <View
      accessibilityLabel={`${lead} ${follow}`}
      style={{
        backgroundColor: c.greenLight,
        borderRadius: 16,
        padding: 20,
        gap: 12,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.semibold,
          fontSize: 19,
          lineHeight: 27,
          letterSpacing: -0.4,
          color: c.green,
        }}
      >
        {lead}
      </Text>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 6,
          height: 50,
        }}
      >
        {stats.days.map((d, i) => (
          <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: "100%",
                maxWidth: 26,
                height: 4 + Math.round((d.count / max) * 26),
                borderRadius: 5,
                backgroundColor: i === 6 ? c.green : "#C9D7BF",
              }}
            />
            <Text
              style={{
                fontFamily: i === 6 ? fonts.semibold : fonts.regular,
                fontSize: 10,
                lineHeight: 12,
                color: i === 6 ? c.green : c.muted,
              }}
            >
              {i === 6 ? "Today" : WEEKDAYS[d.weekday].slice(0, 1)}
            </Text>
          </View>
        ))}
      </View>
      {!!follow && (
        <Text style={[s.small, { color: tones.sage.ink }]}>{follow}</Text>
      )}
    </View>
  );
}

function GoalCard({
  goal,
  api,
  people,
  rowError,
  onOpen,
  onToggle,
  onOpenTask,
}: {
  goal: Goal;
  api: GoalsApi;
  people: GoalPeople;
  rowError: Record<string, string>;
  onOpen: () => void;
  onToggle: (t: GoalTask) => void;
  onOpenTask: (t: GoalTask) => void;
}) {
  const tasks = api.data!.tasks;
  const progress = goalProgress(tasks, goal.id);
  const ids = api.snapshot[goal.id] ?? [];
  const rows = ids
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is GoalTask => !!t);
  const target = goal.targetDate
    ? `by ${dueLabel(goal.targetDate, new Date()).text.replace(/^Due |^Overdue · /, "")}`
    : "";
  return (
    <View
      style={[
        s.card,
        { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open goal ${goal.title}`}
        onPress={onOpen}
        style={[s.row, { gap: 12, minHeight: 44 }]}
      >
        <GoalMark goal={goal} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 17,
              lineHeight: 23,
              letterSpacing: -0.3,
              color: c.ink,
            }}
          >
            {goal.title}
          </Text>
          <Text style={s.small}>
            {progress.done} of {progress.total} done
            {target ? ` · ${target}` : ""}
            {goal.ownerId !== people.me
              ? ` · ${personName(people, goal.ownerId)}’s goal`
              : ""}
          </Text>
        </View>
        <ChevronRight size={18} color={c.faint} />
      </Pressable>
      {(goal.memberIds?.length ?? 1) > 1 && (
        <View style={{ marginTop: 6 }}>
          <SharedWith goal={goal} people={people} ring={c.paper} />
        </View>
      )}
      <View style={[s.row, { marginTop: 12, marginBottom: 4 }]}>
        <ProgressBar done={progress.done} total={progress.total} />
      </View>
      {rows.map((t) => {
        const done = t.status === "done";
        const parent = t.parentId
          ? tasks.find((p) => p.id === t.parentId)
          : null;
        return (
          <View
            key={t.id}
            style={{
              borderTopWidth: 1,
              borderColor: c.border,
              paddingVertical: 9,
            }}
          >
            <View style={[s.row, { gap: 12, alignItems: "flex-start" }]}>
              <View style={{ paddingTop: 1 }}>
                <Checkbox
                  checked={done}
                  label={taskLabel(t)}
                  onPress={() => onToggle(t)}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open task ${t.description}`}
                onPress={() => onOpenTask(t)}
                style={{ flex: 1, minHeight: 28 }}
              >
                <Text
                  style={[
                    s.text,
                    { lineHeight: 21 },
                    done && {
                      color: c.faint,
                      textDecorationLine: "line-through",
                    },
                  ]}
                >
                  {t.description}
                </Text>
                {!done && (
                  <TaskMeta
                    task={t}
                    context={parent ? `in ${parent.description}` : undefined}
                  />
                )}
              </Pressable>
              {done && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Undo completing ${t.description}`}
                  onPress={() => onToggle(t)}
                  style={{
                    minHeight: 32,
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.semibold,
                      fontSize: 12,
                      color: c.green,
                    }}
                  >
                    Undo
                  </Text>
                </Pressable>
              )}
            </View>
            {!!rowError[t.id] && (
              <Text
                accessibilityLiveRegion="polite"
                style={[s.error, { marginLeft: 34 }]}
              >
                {rowError[t.id]}
              </Text>
            )}
          </View>
        );
      })}
      {!rows.length && (
        <Text
          style={[
            s.text,
            {
              color: c.muted,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderColor: c.border,
            },
          ]}
        >
          {progress.total
            ? "All clear. What’s the next step?"
            : "Add a first small step."}
        </Text>
      )}
      <View style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: 4 }}>
        <QuickAdd
          collapsed
          label="Add a task"
          placeholder={`Add a task to ${goal.title}…`}
          onSubmit={(text) => api.createTask(goal.id, { description: text })}
        />
      </View>
    </View>
  );
}

function RecentlyDone({
  api,
  onOpenTask,
}: {
  api: GoalsApi;
  onOpenTask: (t: GoalTask) => void;
}) {
  const { goals, tasks } = api.data!;
  const recent = tasks
    .filter((t) => t.status === "done" && t.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
    .slice(0, 5);
  if (!recent.length) return null;
  const today = localDate(new Date());
  return (
    <View style={[s.card, { padding: 22, gap: 12 }]}>
      <Text style={[s.h2, { fontSize: 16 }]}>Recently completed</Text>
      {recent.map((t) => {
        const goal = goals.find((g) => g.id === t.goalId);
        const day = localDate(new Date(t.completedAt!));
        return (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            onPress={() => onOpenTask(t)}
            style={[s.row, { gap: 10 }]}
          >
            {goal && <GoalMark goal={goal} size={27} />}
            <Text
              numberOfLines={1}
              style={[s.small, { flex: 1, color: c.ink }]}
            >
              {t.description}
            </Text>
            <Text style={[s.small, { fontSize: 11 }]}>
              {day === today ? "Today" : WEEKDAYS[parseDate(day).getDay()]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionToggle({
  label,
  open,
  onPress,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[s.row, { gap: 6, minHeight: 40, alignSelf: "flex-start" }]}
    >
      {open ? (
        <ChevronDown size={15} color={c.muted} />
      ) : (
        <ChevronRight size={15} color={c.muted} />
      )}
      <Text style={[s.label, { color: c.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function GoalsScreen({
  space,
  desktop,
  wide,
  onToast,
  onFindFriends,
}: {
  space: Bootstrap;
  desktop: boolean;
  wide: boolean;
  onToast: (message: string) => void;
  onFindFriends: () => void;
}) {
  const people = peopleOf(space);
  const api = useGoals(people.me);
  const [goalId, setGoalId] = useState<string | null>(null),
    [taskId, setTaskId] = useState<string | null>(null),
    [form, setForm] = useState<true | Goal | false>(false),
    [confirm, setConfirm] = useState<null | {
      title: string;
      body: string;
      label: string;
      run: () => Promise<unknown>;
    }>(null),
    [rowError, setRowError] = useState<Record<string, string>>({}),
    [showReached, setShowReached] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [sharingId, setSharingId] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const phone = !desktop;
  const data = api.data;
  const goal = data?.goals.find((g) => g.id === goalId) ?? null;
  const task = data?.tasks.find((t) => t.id === taskId) ?? null;
  const sharingGoal = data?.goals.find((g) => g.id === sharingId) ?? null;
  const taskGoal = task
    ? (data?.goals.find((g) => g.id === task.goalId) ?? null)
    : null;

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [goalId]);
  useEffect(() => {
    if (taskId && data && !task) setTaskId(null); // deleted elsewhere
  }, [taskId, data, task]);

  function openGoal(id: string | null) {
    if (!id && goalId) api.resnapshot();
    setGoalId(id);
    setTaskId(null);
  }
  async function guarded(t: GoalTask, action: () => Promise<unknown>) {
    setRowError((e) => ({ ...e, [t.id]: "" }));
    try {
      await action();
    } catch (e) {
      setRowError((x) => ({
        ...x,
        [t.id]: `Couldn’t save. ${(e as Error).message}`,
      }));
    }
  }
  function toggle(t: GoalTask) {
    if (t.status === "done") return guarded(t, () => api.reopenTask(t.id));
    const open = openDescendants(data!.tasks, t.id);
    if (!open.length) return guarded(t, () => api.completeTask(t.id, false));
    setConfirm({
      title: "Complete the whole branch?",
      body: `“${t.description}” still has ${plural(open.length, "open sub-task")}. Completing it will complete ${open.length === 1 ? "it" : "them"} too.`,
      label: `Complete all ${open.length + 1}`,
      run: () => api.completeTask(t.id, true),
    });
  }
  function removeTask(t: GoalTask) {
    const below = data!.tasks.filter((x) =>
      ancestors(data!.tasks, x).some((a) => a.id === t.id),
    ).length;
    setConfirm({
      title: "Delete this task?",
      body: below
        ? `“${t.description}” and its ${plural(below, "sub-task")} will be deleted. This can’t be undone.`
        : `“${t.description}” will be deleted. This can’t be undone.`,
      label: "Delete",
      run: async () => {
        await api.deleteTask(t.id);
        setTaskId(null);
      },
    });
  }
  async function leave(g: Goal) {
    await api.removeMember(g.id, people.me);
    setSharingId(null);
    openGoal(null);
    onToast(`You left ${g.title}.`);
  }
  function goalMenu(g: Goal, action: GoalMenuAction) {
    if (action === "edit") return setForm(g);
    if (action === "share") return setSharingId(g.id);
    if (action === "leave")
      return setConfirm({
        title: "Leave this goal?",
        body: `You’ll stop seeing “${g.title}” and its tasks. Tasks you added or completed stay with the goal.`,
        label: "Leave goal",
        run: () => leave(g),
      });
    if (action === "delete")
      return setConfirm({
        title: "Delete this goal?",
        body: `“${g.title}” and all ${plural(goalProgress(data!.tasks, g.id).total, "task")} will be deleted. This can’t be undone. Archive it instead to keep the history.`,
        label: "Delete goal",
        run: async () => {
          await api.deleteGoal(g.id);
          openGoal(null);
          onToast("Goal deleted.");
        },
      });
    const status =
      action === "reached"
        ? "reached"
        : action === "archive"
          ? "archived"
          : "active";
    api
      .updateGoal(g.id, { status })
      .then(() =>
        onToast(
          status === "reached"
            ? `Goal reached: ${g.title}. Well done.`
            : status === "archived"
              ? "Goal archived."
              : "Goal back in progress.",
        ),
      )
      .catch((e) => onToast((e as Error).message));
  }

  const detail = task && taskGoal && (
    <TaskDetail
      key={task.id}
      task={task}
      goal={taskGoal}
      api={api}
      inline={wide && !!goal}
      onSelect={setTaskId}
      onToggle={toggle}
      onDelete={removeTask}
      onClose={() => setTaskId(null)}
    />
  );
  const inlineDetail = wide && !!goal && task?.goalId === goal.id;

  const ordered = data ? orderGoals(data.goals, data.tasks) : [];
  const active = ordered.filter((g) => g.status === "active");
  const reached = ordered.filter((g) => g.status === "reached");
  const archived = ordered.filter((g) => g.status === "archived");

  const header = (
    <View style={{ gap: 9, marginBottom: 24 }}>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fonts.semibold,
          fontSize: desktop ? 34 : 28,
          lineHeight: desktop ? 43 : 36,
          letterSpacing: desktop ? -1 : -0.7,
          color: c.ink,
        }}
      >
        What are you working toward?
      </Text>
      <Text style={[s.text, { fontSize: 13, color: c.muted, lineHeight: 21 }]}>
        Big ambitions, one small step at a time.
      </Text>
    </View>
  );

  const home = data && (
    <View>
      {header}
      {!data.goals.length ? (
        <View style={[s.card, { padding: 32, alignItems: "center", gap: 12 }]}>
          <View
            style={{
              backgroundColor: c.greenLight,
              borderRadius: 16,
              padding: 15,
            }}
          >
            <Sprout color={c.green} size={25} strokeWidth={1.5} />
          </View>
          <Text style={[s.h2, { fontSize: 18, textAlign: "center" }]}>
            Plant your first goal.
          </Text>
          <Text
            style={[
              s.text,
              { color: c.muted, textAlign: "center", maxWidth: 340 },
            ]}
          >
            Write down something you want to achieve, then break it into small
            steps.
          </Text>
          <Action icon={Plus} onPress={() => setForm(true)}>
            Create a goal
          </Action>
        </View>
      ) : (
        <View
          style={{ flexDirection: "row", gap: 28, alignItems: "flex-start" }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
            {!wide && api.stats && <Momentum stats={api.stats} />}
            <View
              style={[
                s.between,
                { marginTop: wide ? 0 : 8, gap: 10, flexWrap: "wrap" },
              ]}
            >
              <Text style={s.h2}>Up next</Text>
              <View style={[s.row, { gap: 8 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    api.pending.length
                      ? `Refresh, ${plural(api.pending.length, "change")}`
                      : "Refresh"
                  }
                  disabled={api.loading}
                  onPress={api.refresh}
                  style={({ hovered }: any) => [
                    s.row,
                    {
                      gap: 8,
                      minHeight: 40,
                      paddingHorizontal: 14,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: api.pending.length ? "#D3DEC8" : c.border,
                      backgroundColor: api.pending.length
                        ? c.greenLight
                        : hovered
                          ? "#F0F3E9"
                          : c.paper,
                    },
                  ]}
                >
                  {api.loading ? (
                    <ActivityIndicator size="small" color={c.green} />
                  ) : (
                    <RefreshCw
                      size={15}
                      color={api.pending.length ? c.green : c.ink}
                      strokeWidth={1.8}
                    />
                  )}
                  <Text
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: 13,
                      color: api.pending.length ? c.green : c.ink,
                    }}
                  >
                    Refresh
                  </Text>
                  {!!api.pending.length && (
                    <View
                      style={{
                        backgroundColor: c.green,
                        borderRadius: 9,
                        paddingHorizontal: 7,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.semibold,
                          fontSize: 11,
                          lineHeight: 18,
                          color: "white",
                        }}
                      >
                        {api.pending.length}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <Action
                  icon={Plus}
                  label="New goal"
                  onPress={() => setForm(true)}
                  style={{ minHeight: 40, paddingHorizontal: 14 }}
                >
                  Goal
                </Action>
              </View>
            </View>
            {active.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                api={api}
                people={people}
                rowError={rowError}
                onOpen={() => openGoal(g.id)}
                onToggle={toggle}
                onOpenTask={(t) => setTaskId(t.id)}
              />
            ))}
            {!active.length && (
              <Text style={[s.text, { color: c.muted }]}>
                No goals in progress. Start a new one when you’re ready.
              </Text>
            )}
            {!!reached.length && (
              <View style={{ gap: 8, marginTop: 6 }}>
                <SectionToggle
                  label={`Reached · ${reached.length}`}
                  open={showReached}
                  onPress={() => setShowReached((x) => !x)}
                />
                {showReached &&
                  reached.map((g) => (
                    <Pressable
                      key={g.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open reached goal ${g.title}`}
                      onPress={() => openGoal(g.id)}
                      style={[s.card, s.row, { gap: 12, padding: 14 }]}
                    >
                      <GoalMark goal={g} size={32} />
                      <Text style={[s.label, { flex: 1 }]}>{g.title}</Text>
                      <Text style={s.small}>
                        {g.reachedAt
                          ? `Reached ${formatDate(localDate(new Date(g.reachedAt))).slice(4, -5)}`
                          : "Reached"}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            )}
            {!!archived.length && (
              <View style={{ gap: 8 }}>
                <SectionToggle
                  label={`Archived · ${archived.length}`}
                  open={showArchived}
                  onPress={() => setShowArchived((x) => !x)}
                />
                {showArchived &&
                  archived.map((g) => (
                    <View
                      key={g.id}
                      style={[s.card, s.row, { gap: 12, padding: 14 }]}
                    >
                      <GoalMark goal={g} size={32} />
                      <Text style={[s.label, { flex: 1, color: c.muted }]}>
                        {g.title}
                      </Text>
                      {g.ownerId === people.me ? (
                        <Action
                          secondary
                          onPress={() => goalMenu(g, "active")}
                          style={{ minHeight: 36 }}
                        >
                          Restore
                        </Action>
                      ) : (
                        <Text style={s.small}>
                          {personName(people, g.ownerId)}’s goal
                        </Text>
                      )}
                    </View>
                  ))}
              </View>
            )}
          </View>
          {wide && (
            <View style={{ width: 278, gap: 22 }}>
              {api.stats && <Momentum stats={api.stats} />}
              <RecentlyDone api={api} onOpenTask={(t) => setTaskId(t.id)} />
            </View>
          )}
        </View>
      )}
    </View>
  );

  // iOS presents one Modal at a time, so a confirmation raised from the task
  // sheet renders inside that sheet rather than beside it.
  const sheetOpen = !!(detail && !inlineDetail && task && taskGoal);
  const confirmNode = confirm && (
    <Confirm
      title={confirm.title}
      body={confirm.body}
      confirmLabel={confirm.label}
      onConfirm={confirm.run}
      onClose={() => setConfirm(null)}
    />
  );
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: desktop ? 40 : 18,
          paddingTop: desktop ? 34 : 26,
          paddingBottom: phone && goal ? 96 : 36,
        }}
      >
        <View style={{ width: "100%", maxWidth: 1190, alignSelf: "center" }}>
          {!data && api.loading && (
            <View style={{ paddingVertical: 60, alignItems: "center" }}>
              <ActivityIndicator color={c.green} />
            </View>
          )}
          {!!api.error && (
            <View style={[s.card, { padding: 18, gap: 10, marginBottom: 16 }]}>
              <Text accessibilityLiveRegion="polite" style={s.error}>
                {api.error}
              </Text>
              <Action
                secondary
                onPress={api.refresh}
                style={{ alignSelf: "flex-start" }}
              >
                Try again
              </Action>
            </View>
          )}
          {goal ? (
            <GoalPage
              goal={goal}
              api={api}
              people={people}
              desktop={desktop}
              phone={phone}
              selectedId={taskId}
              detail={inlineDetail ? detail : null}
              onSelect={setTaskId}
              onToggle={toggle}
              onBack={() => openGoal(null)}
              onMenu={(action) => goalMenu(goal, action)}
            />
          ) : (
            home
          )}
        </View>
      </ScrollView>
      {phone && goal && goal.status !== "archived" && (
        <View
          style={{
            backgroundColor: c.paper,
            borderTopWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <QuickAdd
            docked
            placeholder="Add a task to this goal…"
            label="Add a task to this goal"
            onSubmit={(text) => api.createTask(goal.id, { description: text })}
          />
        </View>
      )}
      {sheetOpen && task && taskGoal && (
        <Sheet
          title={`Task: ${task.description}`}
          placement={phone ? "bottom" : "side"}
          closeLabel="Close task"
          onClose={() => setTaskId(null)}
          header={
            <TaskTrail
              goal={taskGoal}
              task={task}
              tasks={data!.tasks}
              onSelect={setTaskId}
              onGoal={() => {
                openGoal(taskGoal.id);
              }}
            />
          }
        >
          {detail}
          {confirmNode}
        </Sheet>
      )}
      {!!form && (
        <GoalForm
          goal={form === true ? undefined : form}
          people={people}
          onFindFriends={() => {
            setForm(false);
            onFindFriends();
          }}
          onClose={() => setForm(false)}
          onSave={async (input) => {
            if (form === true) {
              const g = await api.createGoal(input);
              setForm(false);
              openGoal(g.id);
            } else {
              await api.updateGoal(form.id, input);
              setForm(false);
            }
          }}
        />
      )}
      {sharingGoal && (
        <GoalPeopleSheet
          goal={sharingGoal}
          people={people}
          onClose={() => setSharingId(null)}
          onShare={async (ids) => {
            const g = await api.shareGoal(sharingGoal.id, ids);
            onToast(
              ids.length === 1
                ? `Shared with ${personName(people, ids[0])}.`
                : `Shared with ${ids.length} friends.`,
            );
            return g;
          }}
          onRemove={(id) =>
            id === people.me
              ? leave(sharingGoal)
              : api.removeMember(sharingGoal.id, id)
          }
          onFindFriends={() => {
            setSharingId(null);
            onFindFriends();
          }}
        />
      )}
      {!sheetOpen && confirmNode}
    </View>
  );
}

import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  PencilLine,
  Archive,
  Trash,
  CircleCheck,
  RotateCcw,
  UserPlus,
  LogOut,
} from "lucide-react-native";
import { colors as c, fonts, s } from "./theme";
import { Action, IconButton } from "./ui";
import { Sheet } from "./Sheet";
import {
  Checkbox,
  GoalMark,
  ProgressBar,
  QuickAdd,
  TaskMeta,
  priorityLabel,
} from "./GoalParts";
import {
  childrenOf,
  daysUntil,
  formatDate,
  goalProgress,
  nextTasks,
} from "./goals";
import type { Goal, GoalTask } from "./types";
import type { GoalsApi } from "./useGoals";
import { SharedWith, personName, type GoalPeople } from "./GoalPeople";

export type GoalMenuAction =
  "edit" | "reached" | "active" | "archive" | "delete" | "share" | "leave";

/** "Done by Sam" when someone else completed a task in a shared goal. */
export function doneBy(t: GoalTask, people?: GoalPeople) {
  if (!people || t.status !== "done" || !t.completedBy) return undefined;
  if (t.completedBy === people.me) return undefined;
  return `Done by ${personName(people, t.completedBy)}`;
}

export function taskLabel(t: GoalTask) {
  const parts = [t.description, priorityLabel(t.priority)].filter(Boolean);
  return `${t.status === "done" ? "Reopen" : "Complete"}: ${parts.join(", ")}`;
}

function TaskRow({
  task,
  tasks,
  people,
  depth,
  indent,
  selected,
  expanded,
  childCount,
  onToggleExpand,
  onSelect,
  onToggle,
}: {
  task: GoalTask;
  tasks: GoalTask[];
  people?: GoalPeople;
  depth: number;
  indent: number;
  selected: boolean;
  expanded: boolean | null;
  childCount: { done: number; total: number } | null;
  onToggleExpand: () => void;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const done = task.status === "done";
  return (
    <View
      accessibilityRole="none"
      aria-level={depth + 1}
      style={[
        s.row,
        {
          alignItems: "flex-start",
          gap: 8,
          paddingLeft: depth * indent,
          paddingRight: 8,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderColor: selected ? "transparent" : c.border,
          borderRadius: selected ? 9 : 0,
          backgroundColor: selected ? c.greenLight : "transparent",
        },
      ]}
    >
      <View style={{ width: 24, alignItems: "center", paddingTop: 3 }}>
        {expanded !== null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${task.description}`}
            accessibilityState={{ expanded }}
            onPress={onToggleExpand}
            hitSlop={10}
          >
            {expanded ? (
              <ChevronDown size={16} color={c.faint} />
            ) : (
              <ChevronRight size={16} color={c.faint} />
            )}
          </Pressable>
        )}
      </View>
      <View style={{ paddingTop: 2 }}>
        <Checkbox checked={done} label={taskLabel(task)} onPress={onToggle} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open task ${task.description}`}
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={[
          s.row,
          { flex: 1, minHeight: 32, gap: 8, alignItems: "flex-start" },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              s.text,
              { lineHeight: 21, paddingTop: 2 },
              done && { color: c.faint, textDecorationLine: "line-through" },
            ]}
          >
            {task.description}
          </Text>
          <TaskMeta
            task={task}
            extra={
              [doneBy(task, people), task.notes && "Has notes"]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
        </View>
        {childCount && (
          <Text style={[s.small, { fontSize: 11, paddingTop: 3 }]}>
            {childCount.done} of {childCount.total}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function TaskTree({
  goal,
  tasks,
  people,
  showDone,
  selectedId,
  phone,
  onSelect,
  onToggle,
}: {
  goal: Goal;
  tasks: GoalTask[];
  people?: GoalPeople;
  showDone: boolean;
  selectedId: string | null;
  phone: boolean;
  onSelect: (id: string) => void;
  onToggle: (t: GoalTask) => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const indent = phone ? 20 : 26;
  const visible = (t: GoalTask) => showDone || t.status === "open";
  const rows: React.ReactNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const t of childrenOf(tasks, goal.id, parentId)) {
      if (!visible(t)) continue;
      const kids = childrenOf(tasks, goal.id, t.id);
      const shownKids = kids.filter(visible);
      const openKids = kids.filter((k) => k.status === "open").length;
      const expanded = shownKids.length
        ? (overrides[t.id] ?? openKids < 6)
        : null;
      rows.push(
        <TaskRow
          key={t.id}
          task={t}
          tasks={tasks}
          people={people}
          depth={depth}
          indent={indent}
          selected={selectedId === t.id}
          expanded={expanded}
          childCount={
            kids.length
              ? { done: kids.length - openKids, total: kids.length }
              : null
          }
          onToggleExpand={() =>
            setOverrides((o) => ({ ...o, [t.id]: !expanded }))
          }
          onSelect={() => onSelect(t.id)}
          onToggle={() => onToggle(t)}
        />,
      );
      if (expanded) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return <View>{rows}</View>;
}

export function GoalPage({
  goal,
  api,
  people,
  desktop,
  phone,
  selectedId,
  detail,
  onSelect,
  onToggle,
  onBack,
  onMenu,
}: {
  goal: Goal;
  api: GoalsApi;
  people: GoalPeople;
  desktop: boolean;
  phone: boolean;
  selectedId: string | null;
  /** Inline task detail for wide screens. */
  detail: React.ReactNode;
  onSelect: (id: string) => void;
  onToggle: (t: GoalTask) => void;
  onBack: () => void;
  onMenu: (action: GoalMenuAction) => void;
}) {
  const tasks = api.data?.tasks ?? [];
  const [view, setView] = useState<"all" | "next">("all"),
    [showDone, setShowDone] = useState(false),
    [menu, setMenu] = useState(false);
  const progress = goalProgress(tasks, goal.id);
  const open = progress.total - progress.done;
  const next = nextTasks(tasks, goal.id);
  const days = goal.targetDate ? daysUntil(goal.targetDate, new Date()) : null;
  const meta = [
    goal.targetDate &&
      `Target ${formatDate(goal.targetDate).slice(4)}${
        days !== null && goal.status === "active"
          ? days > 0
            ? ` · ${days} ${days === 1 ? "day" : "days"} left`
            : days === 0
              ? " · today"
              : " · past target"
          : ""
      }`,
    goal.status === "reached" && "Goal reached",
    goal.status === "archived" && "Archived",
    desktop && `${progress.done} of ${progress.total} done`,
  ]
    .filter(Boolean)
    .join(" · ");

  const owner = goal.ownerId === people.me;
  const share = {
    action: "share" as const,
    label: "Share goal",
    icon: UserPlus,
  };
  const menuItems: { action: GoalMenuAction; label: string; icon: any }[] =
    owner
      ? [
          share,
          { action: "edit", label: "Edit goal", icon: PencilLine },
          goal.status === "active"
            ? {
                action: "reached",
                label: "Mark goal reached",
                icon: CircleCheck,
              }
            : {
                action: "active",
                label:
                  goal.status === "archived"
                    ? "Restore goal"
                    : "Back in progress",
                icon: RotateCcw,
              },
          ...(goal.status !== "archived"
            ? [
                {
                  action: "archive" as const,
                  label: "Archive goal",
                  icon: Archive,
                },
              ]
            : []),
          { action: "delete", label: "Delete goal", icon: Trash },
        ]
      : [share, { action: "leave", label: "Leave goal", icon: LogOut }];

  return (
    <View style={{ gap: 18 }}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={[s.row, { gap: 6, minHeight: 32, alignSelf: "flex-start" }]}
      >
        <ArrowLeft size={14} color={c.muted} />
        <Text style={s.small}>All goals</Text>
      </Pressable>
      <View style={[s.row, { gap: 14, alignItems: "flex-start" }]}>
        <GoalMark goal={goal} size={desktop ? 52 : 44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fonts.semibold,
              fontSize: desktop ? 34 : 24,
              lineHeight: desktop ? 43 : 31,
              letterSpacing: desktop ? -1 : -0.6,
              color: c.ink,
            }}
          >
            {goal.title}
          </Text>
          {!!meta && (
            <Text style={[s.text, { fontSize: 13, color: c.muted }]}>
              {meta}
            </Text>
          )}
          {!owner && (
            <Text style={[s.text, { fontSize: 13, color: c.muted }]}>
              {personName(people, goal.ownerId)}’s goal
            </Text>
          )}
        </View>
        <IconButton
          icon={UserPlus}
          label="Share goal"
          onPress={() => onMenu("share")}
        />
        <IconButton
          icon={Ellipsis}
          label="Goal options"
          onPress={() => setMenu(true)}
        />
      </View>
      <SharedWith goal={goal} people={people} onPress={() => onMenu("share")} />
      {!!goal.why && (
        <Text style={[s.text, { fontSize: 13, color: c.muted }]}>
          Why it matters: {goal.why}
        </Text>
      )}
      <View style={[s.row, { gap: 10 }]}>
        <ProgressBar done={progress.done} total={progress.total} />
        <Text style={[s.small, { color: c.ink, fontFamily: fonts.medium }]}>
          {progress.done} / {progress.total}
        </Text>
      </View>
      {owner &&
        goal.status === "active" &&
        progress.total > 0 &&
        open === 0 && (
          <View
            style={[
              s.between,
              {
                backgroundColor: c.greenLight,
                borderRadius: 14,
                padding: 16,
                gap: 12,
                flexWrap: "wrap",
              },
            ]}
          >
            <Text
              style={[
                s.text,
                {
                  color: c.green,
                  fontFamily: fonts.medium,
                  flex: 1,
                  minWidth: 180,
                },
              ]}
            >
              Every step is done. Did you reach this goal?
            </Text>
            <Action onPress={() => onMenu("reached")}>Mark goal reached</Action>
          </View>
        )}
      <View style={{ flexDirection: "row", gap: 28, alignItems: "flex-start" }}>
        <View
          style={[
            s.card,
            {
              flex: 1,
              minWidth: 0,
              padding: desktop ? 22 : 16,
              paddingTop: 16,
              gap: 6,
            },
          ]}
        >
          <View style={[s.between, { gap: 10, marginBottom: 4 }]}>
            <View
              accessibilityRole="tablist"
              style={[
                s.row,
                {
                  gap: 4,
                  backgroundColor: c.sidebar,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 10,
                  padding: 3,
                },
              ]}
            >
              {(
                [
                  ["all", "All tasks"],
                  ["next", "Up next"],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: view === key }}
                  onPress={() => setView(key)}
                  style={{
                    minHeight: 32,
                    justifyContent: "center",
                    paddingHorizontal: 12,
                    borderRadius: 7,
                    backgroundColor: view === key ? c.paper : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: view === key ? fonts.medium : fonts.regular,
                      fontSize: 12,
                      color: view === key ? c.green : c.muted,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {view === "all" && progress.done > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: showDone }}
                onPress={() => setShowDone((x) => !x)}
                style={{ minHeight: 36, justifyContent: "center" }}
              >
                <Text style={[s.small, showDone && { color: c.green }]}>
                  {showDone ? "Hide done" : "Show done"} · {progress.done}
                </Text>
              </Pressable>
            )}
          </View>
          {view === "all" ? (
            <TaskTree
              goal={goal}
              tasks={tasks}
              people={people}
              showDone={showDone}
              selectedId={selectedId}
              phone={phone}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ) : (
            next.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                tasks={tasks}
                people={people}
                depth={0}
                indent={0}
                selected={selectedId === t.id}
                expanded={null}
                childCount={null}
                onToggleExpand={() => {}}
                onSelect={() => onSelect(t.id)}
                onToggle={() => onToggle(t)}
              />
            ))
          )}
          {((view === "all" && open === 0 && !showDone) ||
            (view === "next" && !next.length)) && (
            <Text style={[s.text, { color: c.muted, paddingVertical: 14 }]}>
              {progress.total
                ? "All clear. What’s the next step?"
                : "Break this goal into a first small step."}
            </Text>
          )}
          {!phone && goal.status !== "archived" && (
            <View style={{ marginTop: 8 }}>
              <QuickAdd
                placeholder="Add a task to this goal…"
                label="Add a task to this goal"
                onSubmit={(text) =>
                  api.createTask(goal.id, { description: text })
                }
              />
            </View>
          )}
        </View>
        {detail && (
          <View style={[s.card, { width: 360, padding: 22 }]}>{detail}</View>
        )}
      </View>
      {menu && (
        <Sheet title="Goal options" onClose={() => setMenu(false)}>
          <View style={{ gap: 4 }}>
            {menuItems.map((item) => (
              <Pressable
                key={item.action}
                accessibilityRole="button"
                onPress={() => {
                  setMenu(false);
                  onMenu(item.action);
                }}
                style={({ hovered }: any) => [
                  s.row,
                  {
                    gap: 12,
                    minHeight: 48,
                    paddingHorizontal: 10,
                    borderRadius: 9,
                    backgroundColor: hovered ? c.greenLight : "transparent",
                  },
                ]}
              >
                <item.icon size={18} color={c.muted} strokeWidth={1.7} />
                <Text style={s.text}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      )}
    </View>
  );
}

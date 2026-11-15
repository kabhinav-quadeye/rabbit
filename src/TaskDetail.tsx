import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import { CalendarDays, ChevronRight, X } from "lucide-react-native";
import { colors as c, fonts, s } from "./theme";
import { Action, Chip, IconButton } from "./ui";
import {
  Checkbox,
  DatePicker,
  QuickAdd,
  TaskMeta,
  priorityLabel,
} from "./GoalParts";
import {
  MAX_DEPTH,
  addDays,
  ancestors,
  childrenOf,
  formatDate,
  localDate,
} from "./goals";
import type { Goal, GoalTask, Priority } from "./types";
import type { GoalsApi } from "./useGoals";

// Web renders multiline inputs as textareas; the heading-style field grows instead.
const noResize = Platform.OS === "web" ? ({ resize: "none" } as any) : null;

/** Breadcrumb used as the sheet or panel heading: goal › ancestors. */
export function TaskTrail({
  goal,
  task,
  tasks,
  onSelect,
  onGoal,
}: {
  goal: Goal;
  task: GoalTask;
  tasks: GoalTask[];
  onSelect: (id: string) => void;
  onGoal: () => void;
}) {
  const trail = ancestors(tasks, task).reverse();
  const crumb = (label: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: 32, justifyContent: "center", flexShrink: 1 }}
    >
      <Text numberOfLines={1} style={[s.small, { fontSize: 12 }]}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={[s.row, { gap: 4, flexWrap: "wrap" }]}>
      {crumb(goal.title, onGoal, "goal")}
      {trail.map((t) => (
        <React.Fragment key={t.id}>
          <ChevronRight size={12} color={c.faint} />
          {crumb(t.description, () => onSelect(t.id), t.id)}
        </React.Fragment>
      ))}
    </View>
  );
}

export function TaskDetail({
  task,
  goal,
  api,
  onSelect,
  onToggle,
  onDelete,
  onClose,
  inline = false,
}: {
  task: GoalTask;
  goal: Goal;
  api: GoalsApi;
  onSelect: (id: string) => void;
  onToggle: (task: GoalTask) => void;
  onDelete: (task: GoalTask) => void;
  onClose: () => void;
  /** Inline desktop panel renders its own heading and close button. */
  inline?: boolean;
}) {
  const tasks = api.data?.tasks ?? [];
  const [description, setDescription] = useState(task.description),
    [descriptionHeight, setDescriptionHeight] = useState(27),
    [notes, setNotes] = useState(task.notes),
    [notesState, setNotesState] = useState<"" | "saving" | "saved" | "error">(
      "",
    ),
    [picking, setPicking] = useState(false),
    [error, setError] = useState("");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNotes = useRef(task.notes);
  const pendingNotes = useRef<string | null>(null);
  const updateTask = useRef(api.updateTask);
  updateTask.current = api.updateTask;

  async function save(input: Parameters<GoalsApi["updateTask"]>[1]) {
    setError("");
    try {
      await api.updateTask(task.id, input);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveNotes(value: string) {
    pendingNotes.current = null;
    if (value === latestNotes.current) return;
    setNotesState("saving");
    try {
      await api.updateTask(task.id, { notes: value });
      latestNotes.current = value;
      setNotesState("saved");
    } catch {
      setNotesState("error");
    }
  }
  function changeNotes(value: string) {
    setNotes(value);
    pendingNotes.current = value;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => saveNotes(value), 800);
  }
  // Closing the sheet or switching tasks must not drop the last keystrokes.
  useEffect(
    () => () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
      const value = pendingNotes.current;
      if (value !== null && value !== latestNotes.current)
        updateTask.current(task.id, { notes: value }).catch(() => {});
    },
    // task.id is stable for this instance: the parent keys TaskDetail by task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  function commitDescription() {
    const value = description.trim();
    if (!value) setDescription(task.description);
    else if (value !== task.description) save({ description: value });
  }

  const subtasks = childrenOf(tasks, goal.id, task.id);
  const doneSubtasks = subtasks.filter((t) => t.status === "done").length;
  const today = new Date();
  const quickDates = [
    { label: "Today", value: localDate(today) },
    { label: "Tomorrow", value: localDate(addDays(today, 1)) },
  ];
  const isQuick = quickDates.some((d) => d.value === task.dueDate);
  const done = task.status === "done";

  return (
    <View style={{ gap: 18 }}>
      {inline && (
        <View style={[s.between, { marginRight: -10, marginTop: -6 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TaskTrail
              goal={goal}
              task={task}
              tasks={tasks}
              onSelect={onSelect}
              onGoal={onClose}
            />
          </View>
          <IconButton icon={X} label="Close task" onPress={onClose} />
        </View>
      )}
      <View style={[s.row, { gap: 12, alignItems: "flex-start" }]}>
        <View style={{ paddingTop: 4 }}>
          <Checkbox
            checked={done}
            size={24}
            label={`${done ? "Reopen" : "Complete"}: ${task.description}`}
            onPress={() => onToggle(task)}
          />
        </View>
        <TextInput
          accessibilityLabel="Task description"
          value={description}
          onChangeText={setDescription}
          onBlur={commitDescription}
          onSubmitEditing={commitDescription}
          submitBehavior="blurAndSubmit"
          multiline
          maxLength={500}
          onContentSizeChange={(e) =>
            setDescriptionHeight(Math.max(27, e.nativeEvent.contentSize.height))
          }
          style={[
            {
              flex: 1,
              height: descriptionHeight,
              fontFamily: fonts.semibold,
              fontSize: 19,
              lineHeight: 27,
              letterSpacing: -0.4,
              color: done ? c.muted : c.ink,
              textDecorationLine: done ? "line-through" : "none",
              padding: 0,
            },
            noResize,
          ]}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={s.label}>Priority</Text>
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          {(["none", "low", "medium", "high"] as Priority[]).map((p) => (
            <Chip
              key={p}
              active={task.priority === p}
              onPress={() => p !== task.priority && save({ priority: p })}
            >
              {p === "none"
                ? "None"
                : priorityLabel(p).replace(" priority", "")}
            </Chip>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={s.label}>Due</Text>
        <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
          {quickDates.map((d) => (
            <Chip
              key={d.label}
              active={task.dueDate === d.value}
              onPress={() => save({ dueDate: d.value })}
            >
              {d.label}
            </Chip>
          ))}
          <Chip
            icon={CalendarDays}
            active={!!task.dueDate && !isQuick}
            onPress={() => setPicking((x) => !x)}
          >
            {task.dueDate && !isQuick
              ? task.dueDate.startsWith(String(today.getFullYear()))
                ? formatDate(task.dueDate).slice(0, -5)
                : formatDate(task.dueDate)
              : "Pick a date"}
          </Chip>
          {!!task.dueDate && (
            <Chip onPress={() => save({ dueDate: null })}>Clear</Chip>
          )}
        </View>
        {picking && (
          <DatePicker
            value={task.dueDate}
            onChange={(date) => {
              setPicking(false);
              save({ dueDate: date });
            }}
          />
        )}
      </View>

      <View style={{ gap: 4 }}>
        <View style={s.between}>
          <Text style={s.label}>Sub-tasks</Text>
          {!!subtasks.length && (
            <Text style={s.small}>
              {doneSubtasks} of {subtasks.length}
            </Text>
          )}
        </View>
        {subtasks.map((t) => (
          <View
            key={t.id}
            style={[
              s.row,
              {
                gap: 12,
                paddingVertical: 8,
                borderTopWidth: 1,
                borderColor: c.border,
              },
            ]}
          >
            <Checkbox
              checked={t.status === "done"}
              label={`${t.status === "done" ? "Reopen" : "Complete"}: ${t.description}`}
              onPress={() => onToggle(t)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open sub-task ${t.description}`}
              onPress={() => onSelect(t.id)}
              style={{ flex: 1, minHeight: 32, justifyContent: "center" }}
            >
              <Text
                style={[
                  s.text,
                  t.status === "done" && {
                    color: c.faint,
                    textDecorationLine: "line-through",
                  },
                ]}
              >
                {t.description}
              </Text>
              <TaskMeta
                task={t}
                extra={
                  childrenOf(tasks, goal.id, t.id).length
                    ? `${childrenOf(tasks, goal.id, t.id).length} sub-tasks`
                    : undefined
                }
              />
            </Pressable>
          </View>
        ))}
        <View
          style={{
            borderTopWidth: subtasks.length ? 1 : 0,
            borderColor: c.border,
            paddingTop: 4,
          }}
        >
          <QuickAdd
            key={task.id}
            collapsed
            label="Add a sub-task"
            placeholder="Describe the smaller step…"
            disabled={task.depth >= MAX_DEPTH}
            disabledHint="Tasks can be nested four levels deep."
            onSubmit={(text) =>
              api.createTask(goal.id, { description: text, parentId: task.id })
            }
          />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <View style={s.between}>
          <Text style={s.label}>Notes</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.small, notesState === "error" && { color: c.error }]}
          >
            {notesState === "saving"
              ? "Saving…"
              : notesState === "saved"
                ? "Saved"
                : notesState === "error"
                  ? "Couldn’t save. Keep typing to retry."
                  : ""}
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Task notes"
          placeholder="Anything that helps you finish this: links, numbers, who to call."
          placeholderTextColor={c.muted}
          value={notes}
          onChangeText={changeNotes}
          onBlur={() => {
            if (notesTimer.current) clearTimeout(notesTimer.current);
            saveNotes(notes);
          }}
          multiline
          maxLength={10000}
          style={[
            s.field,
            {
              minHeight: 104,
              fontSize: 13,
              lineHeight: 21,
              textAlignVertical: "top",
            },
          ]}
        />
      </View>

      {!!error && (
        <Text accessibilityLiveRegion="polite" style={s.error}>
          {error}
        </Text>
      )}

      <View
        style={[
          s.between,
          { borderTopWidth: 1, borderColor: c.border, paddingTop: 14, gap: 12 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => onDelete(task)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[s.small, { fontFamily: fonts.medium }]}>
            Delete task
          </Text>
        </Pressable>
        <Action secondary={done} onPress={() => onToggle(task)}>
          {done ? "Reopen" : "Mark complete"}
        </Action>
      </View>
    </View>
  );
}

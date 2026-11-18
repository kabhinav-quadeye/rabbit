import React, { useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import Footprints from "lucide-react-native/icons/footprints";
import BookOpen from "lucide-react-native/icons/book-open";
import Leaf from "lucide-react-native/icons/leaf";
import Languages from "lucide-react-native/icons/languages";
import Flag from "lucide-react-native/icons/flag";
import Heart from "lucide-react-native/icons/heart";
import Check from "lucide-react-native/icons/check";
import Plus from "lucide-react-native/icons/plus";
import Send from "lucide-react-native/icons/send";
import SignalHigh from "lucide-react-native/icons/signal-high";
import SignalMedium from "lucide-react-native/icons/signal-medium";
import SignalLow from "lucide-react-native/icons/signal-low";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { colors as c, tones, fonts, s } from "./theme";
import { Action, IconButton } from "./ui";
import { Sheet } from "./Sheet";
import {
  WEEKDAYS,
  addDays,
  dueLabel,
  localDate,
  monthName,
  parseDate,
} from "./goals";
import type { Goal, GoalTask, Priority } from "./types";

export const goalIcons = {
  run: Footprints,
  book: BookOpen,
  leaf: Leaf,
  language: Languages,
  flag: Flag,
  heart: Heart,
};
export function GoalMark({
  goal,
  size = 38,
}: {
  goal: Pick<Goal, "color" | "icon">;
  size?: number;
}) {
  const tone = tones[goal.color] ?? tones.sage;
  const Icon = goalIcons[goal.icon] ?? Flag;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 11,
        backgroundColor: tone.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.46} color={tone.ink} strokeWidth={1.7} />
    </View>
  );
}

export function Checkbox({
  checked,
  onPress,
  label,
  size = 22,
  disabled = false,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ hovered }: any) => ({
        width: 32,
        height: 32,
        margin: -5,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor: hovered && !checked ? c.greenLight : "transparent",
      })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.6,
          borderColor: checked ? c.green : "#B9C0B4",
          backgroundColor: checked ? c.green : c.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={size * 0.6} color="white" strokeWidth={2.6} />}
      </View>
    </Pressable>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: c.sage,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 3,
          backgroundColor: c.green,
        }}
      />
    </View>
  );
}

const priorityStyle: Record<
  Exclude<Priority, "none">,
  { label: string; color: string; icon: any }
> = {
  high: { label: "High", color: tones.peach.ink, icon: SignalHigh },
  medium: { label: "Medium", color: tones.sand.ink, icon: SignalMedium },
  low: { label: "Low", color: c.muted, icon: SignalLow },
};
export const priorityLabel = (p: Priority) =>
  p === "none" ? "" : `${priorityStyle[p].label} priority`;

/** Priority, due date and optional context, never relying on colour alone. */
export function TaskMeta({
  task,
  context,
  extra,
}: {
  task: GoalTask;
  context?: string;
  extra?: string;
}) {
  const p = task.priority !== "none" ? priorityStyle[task.priority] : null;
  const due =
    task.dueDate && task.status === "open"
      ? dueLabel(task.dueDate, new Date())
      : null;
  if (!p && !due && !context && !extra) return null;
  return (
    <View style={[s.row, { gap: 8, flexWrap: "wrap", marginTop: 2 }]}>
      {p && (
        <View style={[s.row, { gap: 3 }]}>
          <p.icon size={11} color={p.color} strokeWidth={2} />
          <Text
            style={{ fontFamily: fonts.medium, fontSize: 11, color: p.color }}
          >
            {p.label}
          </Text>
        </View>
      )}
      {due && (
        <Text
          style={{
            fontFamily: due.overdue ? fonts.medium : fonts.regular,
            fontSize: 11,
            color: due.overdue ? tones.peach.ink : c.muted,
          }}
        >
          {due.text}
        </Text>
      )}
      {extra && (
        <Text
          style={{ fontFamily: fonts.regular, fontSize: 11, color: c.muted }}
        >
          {extra}
        </Text>
      )}
      {context && (
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.regular,
            fontSize: 11,
            color: c.faint,
            flexShrink: 1,
          }}
        >
          {context}
        </Text>
      )}
    </View>
  );
}

/**
 * Single-line task entry. Enter submits, clears and keeps focus so several
 * steps can be added in a row. `collapsed` starts as a quiet "Add …" row.
 */
export function QuickAdd({
  placeholder,
  onSubmit,
  collapsed = false,
  docked = false,
  label,
  disabled = false,
  disabledHint,
}: {
  placeholder: string;
  onSubmit: (text: string) => Promise<unknown>;
  collapsed?: boolean;
  docked?: boolean;
  label?: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [open, setOpen] = useState(!collapsed),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  async function submit() {
    const text = value.trim();
    if (!text || busy) return;
    if (text.length > 500) {
      setError("Keep a task under 500 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(text);
      setValue("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }
  if (disabled)
    return disabledHint ? (
      <Text style={[s.small, { paddingVertical: 10 }]}>{disabledHint}</Text>
    ) : null;
  if (!open)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        onPress={() => {
          setOpen(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
        style={({ hovered }: any) => [
          s.row,
          {
            gap: 10,
            minHeight: 42,
            borderRadius: 8,
            paddingHorizontal: 2,
            backgroundColor: hovered ? c.bg : "transparent",
          },
        ]}
      >
        <Plus size={16} color={c.muted} />
        <Text style={[s.small, { fontSize: 13 }]}>{label ?? placeholder}</Text>
      </Pressable>
    );
  return (
    <View style={{ gap: 6 }}>
      <View style={[s.row, { gap: 10 }]}>
        <View
          style={[
            s.row,
            {
              flex: 1,
              gap: 10,
              minHeight: 44,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 9,
              paddingHorizontal: 14,
              backgroundColor: c.paper,
            },
          ]}
        >
          {!docked && <Plus size={16} color={c.muted} />}
          <TextInput
            ref={input}
            accessibilityLabel={label ?? placeholder}
            placeholder={placeholder}
            placeholderTextColor={c.muted}
            value={value}
            onChangeText={(t) => {
              setValue(t);
              if (error) setError("");
            }}
            onSubmitEditing={submit}
            onKeyPress={(e: any) => {
              if (e.nativeEvent.key === "Escape" && collapsed && !value)
                setOpen(false);
            }}
            submitBehavior="submit"
            returnKeyType="done"
            autoFocus={collapsed}
            maxLength={600}
            style={[
              {
                flex: 1,
                fontFamily: fonts.regular,
                fontSize: 14,
                color: c.ink,
                minHeight: 42,
              },
            ]}
          />
          {!docked && Platform.OS === "web" && !!value.trim() && (
            <Text style={[s.small, { fontSize: 11 }]}>Enter ↵</Text>
          )}
        </View>
        {docked && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add task"
            disabled={busy || !value.trim()}
            onPress={submit}
            style={{
              width: 44,
              height: 44,
              borderRadius: 9,
              backgroundColor: c.green,
              opacity: busy || !value.trim() ? 0.5 : 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={18} color="white" strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** Compact month grid; no native date-picker dependency. */
export function DatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (date: string) => void;
}) {
  const today = new Date();
  const initial = value ? parseDate(value) : today;
  const [month, setMonth] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const first = addDays(month, -month.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const todayKey = localDate(today);
  return (
    <View style={{ gap: 6, maxWidth: 320 }}>
      <View style={s.between}>
        <IconButton
          icon={ChevronLeft}
          label="Previous month"
          onPress={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        />
        <Text style={s.label}>
          {monthName(month.getMonth())} {month.getFullYear()}
        </Text>
        <IconButton
          icon={ChevronRight}
          label="Next month"
          onPress={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        />
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((d) => (
          <Text
            key={d}
            style={[s.small, { flex: 1, textAlign: "center", fontSize: 11 }]}
          >
            {d.slice(0, 2)}
          </Text>
        ))}
      </View>
      {[0, 1, 2, 3, 4, 5].map((week) => (
        <View key={week} style={{ flexDirection: "row" }}>
          {days.slice(week * 7, week * 7 + 7).map((d) => {
            const key = localDate(d),
              selected = key === value,
              inMonth = d.getMonth() === month.getMonth();
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${WEEKDAYS[d.getDay()]} ${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`}
                accessibilityState={{ selected }}
                onPress={() => onChange(key)}
                style={({ hovered }: any) => ({
                  flex: 1,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  borderWidth: key === todayKey && !selected ? 1 : 0,
                  borderColor: "#D3DEC8",
                  backgroundColor: selected
                    ? c.green
                    : hovered
                      ? c.greenLight
                      : "transparent",
                })}
              >
                <Text
                  style={{
                    fontFamily: selected ? fonts.semibold : fonts.regular,
                    fontSize: 13,
                    color: selected ? "white" : inMonth ? c.ink : c.faint,
                  }}
                >
                  {d.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet title={title} onClose={onClose} closeLabel="Cancel">
      <View style={{ gap: 18 }}>
        <Text style={[s.text, { color: c.muted }]}>{body}</Text>
        {!!error && <Text style={s.error}>{error}</Text>}
        <View
          style={[
            s.row,
            { gap: 10, justifyContent: "flex-end", flexWrap: "wrap" },
          ]}
        >
          <Action secondary onPress={onClose}>
            Cancel
          </Action>
          <Action
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Action>
        </View>
      </View>
    </Sheet>
  );
}

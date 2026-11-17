import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { CalendarDays, Check } from "lucide-react-native";
import { colors as c, tones, fonts, s } from "./theme";
import { Action, Chip, Field } from "./ui";
import { Sheet } from "./Sheet";
import { DatePicker, goalIcons } from "./GoalParts";
import { FriendPicker, type GoalPeople } from "./GoalPeople";
import { formatDate } from "./goals";
import type { Goal, GoalIcon, GoalInput, Tone } from "./types";

const iconNames: Record<GoalIcon, string> = {
  flag: "Flag",
  run: "Running",
  book: "Book",
  leaf: "Leaf",
  language: "Language",
  heart: "Heart",
};

export function GoalForm({
  goal,
  people,
  onClose,
  onSave,
  onFindFriends,
}: {
  goal?: Goal;
  /** When given on create, the form offers sharing with friends. */
  people?: GoalPeople;
  onClose: () => void;
  onSave: (input: GoalInput) => Promise<unknown>;
  onFindFriends?: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? ""),
    [why, setWhy] = useState(goal?.why ?? ""),
    [targetDate, setTargetDate] = useState<string | null>(
      goal?.targetDate ?? null,
    ),
    [color, setColor] = useState<Tone>(goal?.color ?? "sage"),
    [icon, setIcon] = useState<GoalIcon>(goal?.icon ?? "flag"),
    [memberIds, setMemberIds] = useState<string[]>([]),
    [picking, setPicking] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (!title.trim()) {
      setError("Give your goal a title.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(
        goal
          ? { title, why, targetDate, color, icon }
          : { title, why, targetDate, color, icon, memberIds },
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const tone = tones[color];
  return (
    <Sheet
      title={goal ? "Edit goal" : "What do you want to achieve?"}
      onClose={onClose}
    >
      <View style={{ gap: 20 }}>
        {!goal && (
          <Text style={[s.text, { color: c.muted }]}>
            Name something big. You’ll break it into small, doable steps next.
          </Text>
        )}
        <Field
          label="Goal"
          accessibilityLabel="Goal title"
          placeholder="e.g. Run a half marathon"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          autoFocus={!goal}
          onSubmitEditing={save}
        />
        <Field
          label="Why it matters (optional)"
          accessibilityLabel="Why it matters"
          placeholder="A line to come back to when motivation dips"
          value={why}
          onChangeText={setWhy}
          maxLength={500}
        />
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Target date (optional)</Text>
          <View style={[s.row, { gap: 6, flexWrap: "wrap" }]}>
            <Chip
              icon={CalendarDays}
              active={!!targetDate}
              onPress={() => setPicking((x) => !x)}
            >
              {targetDate ? formatDate(targetDate) : "Pick a date"}
            </Chip>
            {!!targetDate && (
              <Chip onPress={() => setTargetDate(null)}>Clear</Chip>
            )}
          </View>
          {picking && (
            <DatePicker
              value={targetDate}
              onChange={(d) => {
                setTargetDate(d);
                setPicking(false);
              }}
            />
          )}
        </View>
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Colour</Text>
          <View style={[s.row, { gap: 12, flexWrap: "wrap" }]}>
            {(Object.keys(tones) as Tone[]).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${key} colour`}
                accessibilityState={{ selected: color === key }}
                onPress={() => setColor(key)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  backgroundColor: tones[key].bg,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: color === key ? 1.5 : 0,
                  borderColor: tones[key].ink,
                }}
              >
                {color === key && <Check size={17} color={tones[key].ink} />}
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Icon</Text>
          <View style={[s.row, { gap: 12, flexWrap: "wrap" }]}>
            {(Object.keys(goalIcons) as GoalIcon[]).map((key) => {
              const Icon = goalIcons[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${iconNames[key]} icon`}
                  accessibilityState={{ selected: icon === key }}
                  onPress={() => setIcon(key)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 11,
                    backgroundColor: icon === key ? tone.bg : "transparent",
                    borderWidth: 1,
                    borderColor: icon === key ? tone.ink : c.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    size={20}
                    color={icon === key ? tone.ink : c.muted}
                    strokeWidth={1.7}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
        {!goal && people && (
          <View style={{ gap: 10 }}>
            <Text style={s.label}>
              Share with friends (optional){" "}
              {!!memberIds.length && (
                <Text style={{ fontFamily: fonts.regular, color: c.muted }}>
                  ({memberIds.length} selected)
                </Text>
              )}
            </Text>
            <Text style={[s.small, { marginTop: -4 }]}>
              {memberIds.length
                ? "They’ll see every task and can add and complete tasks with you."
                : "Only you can see this goal. You can share it later too."}
            </Text>
            <FriendPicker
              people={people}
              exclude={[people.me]}
              selected={memberIds}
              onChange={setMemberIds}
              onFindFriends={onFindFriends}
            />
          </View>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={s.error}>
            {error}
          </Text>
        )}
        <View style={[s.row, { gap: 10, justifyContent: "flex-end" }]}>
          <Action secondary onPress={onClose}>
            Cancel
          </Action>
          <Action loading={busy} onPress={save}>
            {goal ? "Save changes" : "Create goal"}
          </Action>
        </View>
      </View>
    </Sheet>
  );
}

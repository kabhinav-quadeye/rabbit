import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import Check from "lucide-react-native/icons/check";
import Search from "lucide-react-native/icons/search";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import { colors as c, tones, fonts, s } from "./theme";
import { Action, Avatar, GroupIcon, Field } from "./ui";
import { Sheet } from "./Sheet";
import type { Bootstrap, Group } from "./types";
export function Circles({
  data,
  onGroup,
  onCreate,
  compact = false,
}: {
  data: Bootstrap;
  onGroup: (id: string) => void;
  onCreate: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[!compact && s.card, { padding: compact ? 0 : 22, gap: 19 }]}>
      <View style={s.between}>
        <Text style={[s.h2, { fontSize: 16 }]}>
          Your circles
          <Text style={{ fontSize: 12, color: c.muted }}>
            {" "}
            {data.groups.length}
          </Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a circle"
          onPress={onCreate}
          style={{ padding: 5 }}
        >
          <Plus size={17} color={c.muted} />
        </Pressable>
      </View>
      {data.groups.slice(0, 4).map((g) => (
        <Pressable
          key={g.id}
          accessibilityRole="button"
          accessibilityLabel={`Open circle ${g.name}`}
          onPress={() => onGroup(g.id)}
          style={({ hovered }: any) => [
            s.row,
            {
              gap: 11,
              backgroundColor: hovered ? c.bg : "transparent",
              borderRadius: 9,
            },
          ]}
        >
          <GroupIcon group={g} size={39} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.label, { fontSize: 12 }]} numberOfLines={1}>
              {g.name}
            </Text>
            <Text style={[s.small, { fontSize: 10 }]}>
              {g.memberIds.length} members · Private circle
            </Text>
          </View>
          <ArrowUpRight size={13} color={c.faint} />
        </Pressable>
      ))}
      {!data.groups.length && (
        <Text style={s.small}>
          Your circles start with an invitation. Create your first circle below.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a circle"
        onPress={onCreate}
        style={[
          s.row,
          {
            gap: 7,
            paddingTop: 14,
            borderTopWidth: 1,
            borderColor: c.border,
            minHeight: 38,
          },
        ]}
      >
        <Plus size={14} color={c.green} />
        <Text
          style={{ fontFamily: fonts.medium, fontSize: 12, color: c.green }}
        >
          Create a circle
        </Text>
      </Pressable>
    </View>
  );
}
export function GroupForm({
  data,
  group,
  onClose,
  onSave,
  onFindFriends,
}: {
  data: Bootstrap;
  group?: Group;
  onClose: () => void;
  onSave: (input: any) => Promise<void>;
  onFindFriends: () => void;
}) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [color, setColor] = useState("sage"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const users = data.users.filter(
    (u) =>
      data.friendIds.includes(u.id) &&
      !group?.memberIds.includes(u.id) &&
      `${u.name} ${u.handle}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(
        group
          ? { memberIds: selected }
          : { name, description, memberIds: selected, color, icon: "users" },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={group ? "Invite your people" : "A new circle starts here."}
      onClose={onClose}
    >
      <View style={{ gap: 20 }}>
        <Text style={[s.text, { color: c.muted }]}>
          {group
            ? `Add your friends to ${group.name}. They’ll be able to see all posts in this circle.`
            : "A private home for a shared interest. Give it a name, then bring your people along."}
        </Text>
        {!group && (
          <>
            <Field
              label="Circle name"
              accessibilityLabel="Circle name"
              placeholder="e.g. The Sunday reading club"
              value={name}
              onChangeText={setName}
              maxLength={60}
            />
            <Field
              label="What’s this circle about?"
              accessibilityLabel="Circle description"
              placeholder="A little context for your circle (optional)"
              value={description}
              onChangeText={setDescription}
              maxLength={300}
            />
            <View style={{ gap: 10 }}>
              <Text style={s.label}>A color for your circle</Text>
              <View style={[s.row, { gap: 12 }]}>
                {Object.entries(tones).map(([key, t]) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${key} color`}
                    onPress={() => setColor(key)}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      backgroundColor: t.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: color === key ? 1.5 : 0,
                      borderColor: t.ink,
                    }}
                  >
                    {color === key && <Check size={17} color={t.ink} />}
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
        <View style={{ gap: 10 }}>
          <Text style={s.label}>
            {group ? "Choose people" : "Invite people"}{" "}
            <Text style={{ fontFamily: fonts.regular, color: c.muted }}>
              ({selected.length} selected)
            </Text>
          </Text>
          <View
            style={[
              s.row,
              {
                gap: 8,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 8,
                paddingHorizontal: 12,
              },
            ]}
          >
            <Search size={15} color={c.muted} />
            <TextInput
              accessibilityLabel="Find people to invite"
              placeholder="Search your friends…"
              placeholderTextColor={c.muted}
              value={query}
              onChangeText={setQuery}
              style={{
                fontFamily: fonts.regular,
                fontSize: 13,
                minHeight: 42,
                flex: 1,
                color: c.ink,
              }}
            />
          </View>
          {users.map((u) => (
            <Pressable
              key={u.id}
              accessibilityRole="button"
              accessibilityLabel={`Select ${u.name}`}
              accessibilityState={{ selected: selected.includes(u.id) }}
              onPress={() =>
                setSelected((prev) =>
                  prev.includes(u.id)
                    ? prev.filter((id) => id !== u.id)
                    : [...prev, u.id],
                )
              }
              style={[
                s.row,
                {
                  gap: 12,
                  paddingVertical: 8,
                  paddingHorizontal: 7,
                  borderRadius: 8,
                  backgroundColor: selected.includes(u.id)
                    ? c.greenLight
                    : "transparent",
                },
              ]}
            >
              <Avatar user={u} />
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{u.name}</Text>
                <Text style={s.small}>@{u.handle}</Text>
              </View>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: selected.includes(u.id) ? c.green : c.border,
                  backgroundColor: selected.includes(u.id) ? c.green : "white",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected.includes(u.id) && <Check size={13} color="white" />}
              </View>
            </Pressable>
          ))}
          {!users.length && (
            <Text style={[s.small, { paddingVertical: 10 }]}>
              {query
                ? "No friends match your search."
                : "No friends to add yet. Find people in Profile and become friends first."}
            </Text>
          )}
        </View>
        <Action secondary label="Find friends" onPress={onFindFriends}>
          Find friends in Profile
        </Action>
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <View style={[s.between, { gap: 10 }]}>
          <View style={[s.row, { gap: 6, flex: 1 }]}>
            <LockKeyhole size={12} color={c.muted} />
            <Text style={[s.small, { fontSize: 11 }]}>Always private</Text>
          </View>
          <Action
            label={group ? "Add members" : "Create circle"}
            onPress={save}
            loading={busy}
            disabled={group ? !selected.length : !name.trim()}
            icon={Plus}
          >
            {group ? "Add to circle" : "Create circle"}
          </Action>
        </View>
      </View>
    </Sheet>
  );
}

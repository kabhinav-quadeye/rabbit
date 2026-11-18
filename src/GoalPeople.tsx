import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import Check from "lucide-react-native/icons/check";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import Search from "lucide-react-native/icons/search";
import UserPlus from "lucide-react-native/icons/user-plus";
import Users from "lucide-react-native/icons/users";
import { colors as c, fonts, s } from "./theme";
import { Action, Avatar } from "./ui";
import { Sheet } from "./Sheet";
import { Confirm } from "./GoalParts";
import { goalMembers } from "./goals";
import type { Bootstrap, Goal, User } from "./types";

/** Who is looking and who everyone else is, for goal attribution. */
export type GoalPeople = {
  me: string;
  users: User[];
  friendIds: string[];
};
export const personName = (people: GoalPeople, id: string) =>
  id === people.me
    ? "You"
    : (people.users.find((u) => u.id === id)?.name ?? "Someone");
const firstName = (people: GoalPeople, id: string) =>
  personName(people, id).split(" ")[0];
export const peopleOf = (space: Bootstrap): GoalPeople => ({
  me: space.currentUser.id,
  users: space.users,
  friendIds: space.friendIds,
});

/**
 * The privacy line for a goal, worded from the viewer's side: who else can
 * see it. The icon and words change together, like the composer audience.
 */
export function shareSummary(goal: Goal, people: GoalPeople) {
  const others = goalMembers(goal).filter((id) => id !== people.me);
  if (!others.length)
    return { shared: false, text: "Only you can see this goal" };
  const [first, ...rest] = others.map((id) => firstName(people, id));
  const names = rest.length
    ? `${first} and ${rest.length} ${rest.length === 1 ? "other" : "others"}`
    : first;
  return { shared: true, text: `Shared with ${names}` };
}

/** Overlapping avatars, then the privacy line. */
export function SharedWith({
  goal,
  people,
  onPress,
  ring = c.bg,
}: {
  goal: Goal;
  people: GoalPeople;
  onPress?: () => void;
  /** The surface behind the avatars, so overlaps read as separate faces. */
  ring?: string;
}) {
  const members = goalMembers(goal);
  const summary = shareSummary(goal, people);
  const body = (
    <>
      {summary.shared ? (
        <View style={[s.row]}>
          {members.slice(0, 4).map((id, i) => (
            <View
              key={id}
              style={{
                marginLeft: i ? -7 : 0,
                borderRadius: 13,
                borderWidth: 2,
                borderColor: ring,
              }}
            >
              <Avatar user={people.users.find((u) => u.id === id)} size={22} />
            </View>
          ))}
        </View>
      ) : (
        <LockKeyhole size={13} color={c.muted} strokeWidth={1.8} />
      )}
      <Text style={[s.small, { flexShrink: 1 }]}>{summary.text}</Text>
    </>
  );
  if (!onPress)
    return <View style={[s.row, { gap: 8, minHeight: 32 }]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${summary.text}. Manage people`}
      onPress={onPress}
      style={({ hovered }: any) => [
        s.row,
        {
          gap: 8,
          minHeight: 36,
          paddingRight: 8,
          alignSelf: "flex-start",
          borderRadius: 9,
          backgroundColor: hovered ? c.greenLight : "transparent",
        },
      ]}
    >
      {body}
    </Pressable>
  );
}

/** Searchable list of accepted friends with checkboxes, as in the circle form. */
export function FriendPicker({
  people,
  exclude = [],
  selected,
  onChange,
  onFindFriends,
}: {
  people: GoalPeople;
  exclude?: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onFindFriends?: () => void;
}) {
  const [query, setQuery] = useState("");
  const friends = people.users.filter(
    (u) => people.friendIds.includes(u.id) && !exclude.includes(u.id),
  );
  const shown = friends.filter((u) =>
    `${u.name} ${u.handle}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <View style={{ gap: 8 }}>
      {friends.length > 5 && (
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
            accessibilityLabel="Find friends to share with"
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
      )}
      {shown.map((u) => {
        const on = selected.includes(u.id);
        return (
          <Pressable
            key={u.id}
            accessibilityRole="checkbox"
            accessibilityLabel={`Share with ${u.name}`}
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() =>
              onChange(
                on ? selected.filter((id) => id !== u.id) : [...selected, u.id],
              )
            }
            style={[
              s.row,
              {
                gap: 12,
                minHeight: 48,
                paddingVertical: 6,
                paddingHorizontal: 7,
                borderRadius: 8,
                backgroundColor: on ? c.greenLight : "transparent",
              },
            ]}
          >
            <Avatar user={u} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.label} numberOfLines={1}>
                {u.name}
              </Text>
              <Text style={s.small} numberOfLines={1}>
                @{u.handle}
              </Text>
            </View>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: on ? c.green : c.border,
                backgroundColor: on ? c.green : c.paper,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {on && <Check size={13} color="white" />}
            </View>
          </Pressable>
        );
      })}
      {!shown.length && (
        <View style={{ gap: 8, paddingVertical: 4 }}>
          <Text style={s.small}>
            {query
              ? "No friends match your search."
              : people.friendIds.length
                ? "Everyone you’re friends with is already here."
                : "You can share goals with accepted friends. Find people in Profile first."}
          </Text>
          {!query && !people.friendIds.length && onFindFriends && (
            <Action
              secondary
              onPress={onFindFriends}
              style={{ alignSelf: "flex-start", minHeight: 36 }}
            >
              Find friends in Profile
            </Action>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Everyone in a goal. Members invite their own friends; the owner removes
 * people; anyone else can leave. Sharing brings the whole history along.
 */
export function GoalPeopleSheet({
  goal,
  people,
  onClose,
  onShare,
  onRemove,
  onFindFriends,
}: {
  goal: Goal;
  people: GoalPeople;
  onClose: () => void;
  onShare: (ids: string[]) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onFindFriends?: () => void;
}) {
  const members = goalMembers(goal);
  const owner = goal.ownerId === people.me;
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  async function share() {
    setBusy(true);
    setError("");
    try {
      await onShare(selected);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const leaving = confirm === people.me;
  return (
    <Sheet title="People in this goal" onClose={onClose}>
      <View style={{ gap: 20 }}>
        <Text style={[s.text, { color: c.muted }]}>
          Everyone here sees every task in “{goal.title}”, done and still to do,
          and can add and complete tasks.
        </Text>
        <View style={{ gap: 2 }}>
          {members.map((id) => {
            const user = people.users.find((u) => u.id === id);
            const role = id === goal.ownerId ? "Owner" : "Member";
            const canRemove =
              id !== goal.ownerId && (owner || id === people.me);
            return (
              <View
                key={id}
                style={[s.row, { gap: 12, minHeight: 52, paddingVertical: 4 }]}
              >
                <Avatar user={user} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.label} numberOfLines={1}>
                    {id === people.me
                      ? `${user?.name ?? "You"} (you)`
                      : (user?.name ?? "Someone")}
                  </Text>
                  <Text style={s.small}>{role}</Text>
                </View>
                {canRemove && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      id === people.me
                        ? "Leave this goal"
                        : `Remove ${user?.name ?? "this person"}`
                    }
                    onPress={() => setConfirm(id)}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 10,
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.medium,
                        fontSize: 12,
                        color: c.muted,
                      }}
                    >
                      {id === people.me ? "Leave" : "Remove"}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <View style={{ gap: 10 }}>
          <Text style={s.label}>
            Share with friends{" "}
            {!!selected.length && (
              <Text style={{ fontFamily: fonts.regular, color: c.muted }}>
                ({selected.length} selected)
              </Text>
            )}
          </Text>
          <FriendPicker
            people={people}
            exclude={members}
            selected={selected}
            onChange={setSelected}
            onFindFriends={onFindFriends}
          />
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <View style={[s.between, { gap: 10, flexWrap: "wrap" }]}>
          <View style={[s.row, { gap: 6, flex: 1, minWidth: 160 }]}>
            <Users size={12} color={c.muted} />
            <Text style={[s.small, { fontSize: 11 }]}>
              Only the people listed here can see it
            </Text>
          </View>
          <Action
            icon={UserPlus}
            label="Share with selected friends"
            loading={busy}
            disabled={!selected.length}
            onPress={share}
          >
            Share
          </Action>
        </View>
      </View>
      {confirm && (
        <Confirm
          title={leaving ? "Leave this goal?" : "Remove from this goal?"}
          body={
            leaving
              ? `You’ll stop seeing “${goal.title}” and its tasks. Tasks you added or completed stay with the goal.`
              : `${personName(people, confirm)} will stop seeing “${goal.title}” and its tasks. Their work stays with the goal.`
          }
          confirmLabel={leaving ? "Leave goal" : "Remove"}
          onConfirm={() => onRemove(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </Sheet>
  );
}

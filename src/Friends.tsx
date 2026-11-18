import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import UserPlus from "lucide-react-native/icons/user-plus";
import { Action, Avatar, Field, IconButton } from "./ui";
import { colors as c, s } from "./theme";
import { request } from "./api";
import type { Bootstrap, User } from "./types";

export function Friends({
  data,
  onChange,
}: {
  data: Bootstrap;
  onChange: () => Promise<unknown>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const uid = data.currentUser.id;
  const pending = data.friendRequests.filter((r) => r.status === "pending");
  const incoming = pending.filter((r) => r.recipientId === uid);
  const sent = pending.filter((r) => r.senderId === uid);
  const friends = data.users.filter((u) => data.friendIds.includes(u.id));
  useEffect(() => {
    let current = true;
    setSearchError("");
    setResults([]);
    setSearching(!!query.trim());
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      request<User[]>(`/users?q=${encodeURIComponent(query.trim())}`)
        .then((users) => {
          if (current) setResults(users);
        })
        .catch((e) => {
          if (current) setSearchError(e.message);
        })
        .finally(() => {
          if (current) setSearching(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);
  async function act(
    key: string,
    path?: string,
    input?: unknown,
    message = "",
  ) {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      if (path)
        await request(
          path,
          path.endsWith("/requests") ? "POST" : "PATCH",
          input,
        );
      await onChange();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function person(user: User, action: React.ReactNode) {
    return (
      <View
        key={user.id}
        style={[
          s.row,
          {
            gap: 12,
            flexWrap: "wrap",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderColor: c.border,
          },
        ]}
      >
        <Avatar user={user} />
        <View style={{ flex: 1, minWidth: 120, gap: 3 }}>
          <Text style={s.label}>{user.name}</Text>
          <Text style={s.small}>@{user.handle}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {action}
        </View>
      </View>
    );
  }
  function response(user: User, requestId: string) {
    return (
      <>
        <Action
          secondary
          label={`Decline friend request from ${user.name}`}
          disabled={!!busy}
          onPress={() =>
            act(
              requestId,
              `/friends/requests/${encodeURIComponent(requestId)}`,
              { status: "declined" },
              "Request declined.",
            )
          }
        >
          Decline
        </Action>
        <Action
          label={`Accept friend request from ${user.name}`}
          loading={busy === requestId}
          disabled={!!busy}
          onPress={() =>
            act(
              requestId,
              `/friends/requests/${encodeURIComponent(requestId)}`,
              { status: "accepted" },
              `You and ${user.name} are now friends.`,
            )
          }
        >
          Accept
        </Action>
      </>
    );
  }
  return (
    <View style={[s.card, { gap: 20, padding: 22 }]}>
      <View style={s.between}>
        <View style={{ gap: 5, flex: 1 }}>
          <Text style={s.h2}>Your friends</Text>
          <Text style={s.small}>
            Find people by username. Once they accept, you can add them to your
            circles.
          </Text>
        </View>
        <IconButton
          icon={RefreshCw}
          label="Refresh friends"
          onPress={() => act("refresh")}
        />
      </View>
      <Text style={s.small}>Your username: @{data.currentUser.handle}</Text>
      <Field
        label="Find people"
        accessibilityLabel="Find people by username"
        placeholder="Search @username"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={41}
        value={query}
        onChangeText={setQuery}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.text, { color: c.green }]}
        >
          {notice}
        </Text>
      )}
      {query.trim() ? (
        <View accessibilityLiveRegion="polite">
          {searching ? (
            <Text style={s.small}>Finding people…</Text>
          ) : searchError ? (
            <Text accessibilityRole="alert" style={s.error}>
              {searchError}
            </Text>
          ) : !results.length ? (
            <Text style={s.small}>No users match that username.</Text>
          ) : (
            results.map((user) => {
              const received = incoming.find((r) => r.senderId === user.id);
              return person(
                user,
                data.friendIds.includes(user.id) ? (
                  <Text style={s.small}>Friends</Text>
                ) : received ? (
                  response(user, received.id)
                ) : sent.some((r) => r.recipientId === user.id) ? (
                  <Text style={s.small}>Request sent</Text>
                ) : (
                  <Action
                    icon={UserPlus}
                    label={`Add ${user.name} as a friend`}
                    loading={busy === user.id}
                    disabled={!!busy}
                    onPress={() =>
                      act(user.id, "/friends/requests", {
                        recipientId: user.id,
                      })
                    }
                  >
                    Add friend
                  </Action>
                ),
              );
            })
          )}
        </View>
      ) : (
        <>
          {!!incoming.length && (
            <View>
              <Text style={s.label}>Incoming requests</Text>
              {incoming.map((r) => {
                const user = data.users.find((u) => u.id === r.senderId);
                return user ? person(user, response(user, r.id)) : null;
              })}
            </View>
          )}
          <View>
            <Text style={s.label}>Friends · {friends.length}</Text>
            {friends.map((user) =>
              person(user, <Text style={s.small}>Friends</Text>),
            )}
            {!friends.length && (
              <View style={{ gap: 5, paddingVertical: 16 }}>
                <Text style={s.text}>No friends yet.</Text>
                <Text style={s.small}>
                  Ask someone for their username and send your first request
                  above.
                </Text>
              </View>
            )}
          </View>
          {!!sent.length && (
            <View>
              <Text style={s.label}>Sent requests</Text>
              {sent.map((r) => {
                const user = data.users.find((u) => u.id === r.recipientId);
                return user
                  ? person(user, <Text style={s.small}>Request sent</Text>)
                  : null;
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

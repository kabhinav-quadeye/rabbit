import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Copy from "lucide-react-native/icons/copy";
import { request } from "./api";
import { goalWebFetchPath } from "./goal-webfetch";
import { Sheet } from "./Sheet";
import { colors as c, s } from "./theme";
import type { Goal } from "./types";
import { Action } from "./ui";

type WebFetchKey = { token: string; expiresAt: string };

export function GoalWebFetch({
  goal,
  onClose,
}: {
  goal: Goal;
  onClose: () => void;
}) {
  const [key, setKey] = useState<WebFetchKey | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function changeKey(action: "create" | "revoke") {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      if (action === "create") {
        const key = await request<WebFetchKey>(goalWebFetchPath, "POST", {
          goalId: goal.id,
        });
        setKey(key);
      } else {
        await request(goalWebFetchPath, "DELETE");
        setKey(null);
        setNotice("WebFetch token revoked.");
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyAccess() {
    if (!key) return;
    setError("");
    setNotice("");
    try {
      const copied = await Clipboard.setStringAsync(
        [
          `Use WebFetch to read the Rabbit homepage at ${window.location.origin}/ for instructions.`,
          `Goal ID: ${goal.id}`,
          `WebFetch token: ${key.token}`,
        ].join("\n"),
      );
      if (!copied) throw new Error();
      setNotice("WebFetch access copied.");
    } catch {
      setError(
        "Couldn’t access the clipboard. Select and copy the goal ID and token.",
      );
    }
  }

  return (
    <Sheet title="Share with WebFetch" onClose={onClose}>
      <View style={{ gap: 14 }}>
        <Text style={s.h2}>{goal.title}</Text>
        <Text style={s.text}>
          Give your agent 15 minutes to read this goal and suggest tasks. You
          review each suggestion before it’s added.
        </Text>
        <Text style={s.small}>
          Share the token privately. It can appear in your agent’s fetch
          history. Creating a token replaces any previous one.
        </Text>
        {key && (
          <View
            style={{
              gap: 6,
              padding: 12,
              borderRadius: 9,
              backgroundColor: c.sidebar,
            }}
          >
            <Text style={s.label}>Goal ID</Text>
            <Text selectable style={s.small}>
              {goal.id}
            </Text>
            <Text style={s.label}>WebFetch token</Text>
            <Text
              accessibilityLabel="WebFetch token"
              selectable
              style={s.small}
            >
              {key.token}
            </Text>
            <Text style={s.small}>
              Expires at{" "}
              {new Date(key.expiresAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
              .
            </Text>
          </View>
        )}
        <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
          {key ? (
            <Action
              icon={Copy}
              disabled={!!busy}
              onPress={() => void copyAccess()}
            >
              Copy WebFetch access
            </Action>
          ) : (
            <Action
              loading={busy === "create"}
              disabled={!!busy}
              onPress={() => void changeKey("create")}
            >
              Create WebFetch token
            </Action>
          )}
          <Action
            secondary
            loading={busy === "revoke"}
            disabled={!!busy}
            onPress={() => void changeKey("revoke")}
          >
            Revoke token
          </Action>
        </View>
        {!!notice && (
          <Text accessibilityLiveRegion="polite" style={s.small}>
            {notice}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
      </View>
    </Sheet>
  );
}

export function ReviewSuggestedTask({
  goal,
  description,
  onApply,
  onClose,
}: {
  goal?: Goal;
  description: string;
  onApply: () => Promise<void>;
  onClose: () => void;
}) {
  const applying = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canAdd = goal && goal.status !== "archived";

  async function apply() {
    if (applying.current || !canAdd) return;
    applying.current = true;
    setBusy(true);
    setError("");
    try {
      await onApply();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      applying.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Review suggested task"
      onClose={() => !applying.current && onClose()}
    >
      <View style={{ gap: 14 }}>
        {goal ? (
          <>
            <Text style={s.h2}>{goal.title}</Text>
            <View
              style={{
                padding: 14,
                gap: 5,
                borderRadius: 9,
                backgroundColor: c.sidebar,
              }}
            >
              <Text style={s.small}>Suggested task</Text>
              <Text style={s.text}>{description}</Text>
            </View>
            {!canAdd && (
              <Text style={s.small}>Restore this goal to add tasks.</Text>
            )}
          </>
        ) : (
          <Text style={s.text}>This goal isn’t available to your account.</Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
          {canAdd && (
            <Action disabled={busy} loading={busy} onPress={() => void apply()}>
              Add task to goal
            </Action>
          )}
          <Action secondary disabled={busy} onPress={onClose}>
            Dismiss
          </Action>
        </View>
      </View>
    </Sheet>
  );
}

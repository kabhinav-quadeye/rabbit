import React, { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Action, Field } from "./ui";
import { colors as c, fonts, s } from "./theme";
import { agentMcpUrl, request } from "./api";
import type { AgentConnection } from "./types";

export function Agents() {
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = agentMcpUrl();
  async function load() {
    setLoading(true);
    setError("");
    try {
      setConnections(
        (
          await request<{ connections: AgentConnection[] }>(
            "/agent-connections",
          )
        ).connections,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create() {
    if (busy || !name.trim()) return;
    setBusy("create");
    setError("");
    setMessage("");
    try {
      const result = await request<{
        connection: AgentConnection;
        token: string;
      }>("/agent-connections", "POST", { name });
      setConnections((previous) => [result.connection, ...previous]);
      setSecret(result.token);
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function revoke(connection: AgentConnection) {
    if (busy) return;
    setBusy(connection.id);
    setError("");
    setMessage("");
    try {
      await request(`/agent-connections/${connection.id}/revoke`, "POST", {});
      setConnections((previous) =>
        previous.map((c) =>
          c.id === connection.id
            ? { ...c, revokedAt: new Date().toISOString() }
            : c,
        ),
      );
      setMessage(`${connection.name} can no longer access Rabbit.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function copy(value: string, label: string) {
    try {
      await Clipboard.setStringAsync(value);
      setMessage(`${label} copied.`);
    } catch {
      setError("Couldn’t copy. Select and copy the text below, or try again.");
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <View style={[s.card, { padding: 22, gap: 18 }]}>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={s.h2}>
            Connect your research assistant
          </Text>
          <Text style={s.text}>
            Let an agent search and read posts you can access, and mark them
            useful or outdated on your behalf.
          </Text>
          <Text style={s.small}>
            Connections expire after 30 days. Revoke access here at any time.
            Agents cannot publish, comment, or manage your circles.
          </Text>
        </View>
        {loading ? (
          <Text accessibilityLiveRegion="polite" style={s.text}>
            Loading agent connections…
          </Text>
        ) : (
          <>
            {!secret && (
              <View style={{ gap: 14 }}>
                <Field
                  label="Agent name"
                  value={name}
                  onChangeText={setName}
                  maxLength={60}
                  editable={!busy}
                  placeholder="e.g. Research helper"
                  style={{ fontSize: 16 }}
                />
                <Action
                  label="Create agent connection"
                  disabled={!name.trim() || !!busy}
                  loading={busy === "create"}
                  onPress={create}
                  style={{ minHeight: 48, alignSelf: "flex-start" }}
                >
                  Create connection
                </Action>
              </View>
            )}
            {!!secret && (
              <View style={{ gap: 14 }}>
                <Text accessibilityLiveRegion="polite" style={s.label}>
                  Copy this token now. It is shown only once.
                </Text>
                <Text style={s.text}>
                  Keep it private, like a password. Add it as a Bearer token in
                  an MCP client that supports custom authorization headers.
                </Text>
                <Field
                  label="MCP server URL"
                  value={endpoint}
                  editable={false}
                  style={{ fontSize: 16 }}
                />
                <View style={{ gap: 8 }}>
                  <Text style={s.label}>Agent token</Text>
                  <TextInput
                    accessibilityLabel="Agent token"
                    value={secret}
                    editable={false}
                    multiline
                    selectTextOnFocus
                    style={{
                      fontFamily: fonts.regular,
                      fontSize: 16,
                      lineHeight: 24,
                      color: c.ink,
                      backgroundColor: c.bg,
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: 9,
                      padding: 12,
                      minHeight: 100,
                    }}
                  />
                </View>
                <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
                  <Action
                    secondary
                    disabled={!!busy}
                    style={{ minHeight: 48 }}
                    onPress={() => copy(secret, "Token")}
                  >
                    Copy token
                  </Action>
                  <Action
                    secondary
                    disabled={!!busy}
                    style={{ minHeight: 48 }}
                    onPress={() =>
                      copy(
                        JSON.stringify(
                          {
                            mcpServers: {
                              rabbit: {
                                type: "http",
                                url: endpoint,
                                headers: { Authorization: `Bearer ${secret}` },
                              },
                            },
                          },
                          null,
                          2,
                        ),
                        "Connection settings",
                      )
                    }
                  >
                    Copy MCP settings
                  </Action>
                  <Action
                    label="Done with token"
                    disabled={!!busy}
                    style={{ minHeight: 48 }}
                    onPress={() => {
                      setSecret("");
                      setMessage("");
                    }}
                  >
                    Done
                  </Action>
                </View>
                <Text style={s.small}>
                  Use search_posts to find information, read_post for full text,
                  and set_feedback to mark a post. Your agent should ask before
                  changing feedback. Clients without Bearer token support need a
                  compatible MCP bridge.
                </Text>
              </View>
            )}
          </>
        )}
        {!!error && (
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
            <Action
              secondary
              disabled={loading || !!busy}
              onPress={load}
              style={{ minHeight: 48, alignSelf: "flex-start" }}
            >
              Reload connections
            </Action>
          </View>
        )}
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={s.text}>
            {message}
          </Text>
        )}
      </View>
      <View style={[s.card, { padding: 22, gap: 16 }]}>
        <Text accessibilityRole="header" style={s.h2}>
          Your connections
        </Text>
        {!loading && !connections.length && (
          <Text style={s.text}>No agents connected yet.</Text>
        )}
        {connections.map((connection) => {
          const expired = Date.parse(connection.expiresAt) <= Date.now();
          const inactive = !!connection.revokedAt || expired;
          return (
            <View
              key={connection.id}
              testID="agent-connection"
              style={{
                gap: 12,
                paddingTop: 16,
                borderTopWidth: 1,
                borderColor: c.border,
              }}
            >
              <View style={{ gap: 5 }}>
                <Text style={s.label}>{connection.name}</Text>
                <Text style={s.small}>
                  {connection.revokedAt
                    ? "Revoked"
                    : expired
                      ? "Expired"
                      : `Expires ${new Date(connection.expiresAt).toLocaleDateString()}`}
                </Text>
                {!inactive && (
                  <Text style={s.small}>
                    {connection.lastUsedAt
                      ? `Last used ${new Date(connection.lastUsedAt).toLocaleString()}`
                      : "Not used yet"}
                  </Text>
                )}
              </View>
              {!inactive && (
                <Action
                  secondary
                  label={`Revoke ${connection.name}`}
                  disabled={!!busy}
                  loading={busy === connection.id}
                  onPress={() => revoke(connection)}
                  style={{ minHeight: 48, alignSelf: "flex-start" }}
                >
                  Revoke access
                </Action>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { KeyRound, RefreshCw, ArrowUpRight, Trash2 } from "lucide-react-native";
import { request, apiBase } from "./api";
import { colors as c, s } from "./theme";
import { Action, Field } from "./ui";
import type { AgentOverview, AgentDraft } from "./agent-types";

export function Agents() {
  const [data, setData] = useState<AgentOverview | null>(null),
    [name, setName] = useState("");
  const [secret, setSecret] = useState(""),
    [shown, setShown] = useState(false),
    [error, setError] = useState(""),
    [errorAt, setErrorAt] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(""),
    [remove, setRemove] = useState(""),
    [draft, setDraft] = useState<AgentDraft | null>(null);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const mounted = useRef(true),
    pending = useRef(false);
  async function run(key: string, work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (mounted.current) {
        setErrorAt(key);
        setError((e as Error).message);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function reload() {
    const next = await request<AgentOverview>("/agents");
    if (mounted.current) setData(next);
  }
  useEffect(() => {
    mounted.current = true;
    void run("load", reload);
    return () => {
      mounted.current = false;
    };
  }, []);
  async function create() {
    await run("create", async () => {
      const result = await request<{
        token: string;
        connection: AgentOverview["connections"][number];
      }>("/agents/tokens", "POST", { name });
      if (!mounted.current) return;
      setSecret(result.token);
      setShown(false);
      setName("");
      setData((old) => ({
        ...(old ?? { drafts: [], activity: [], connections: [] }),
        connections: [...(old?.connections ?? []), result.connection],
      }));
    });
  }
  const disabled = !!busy;
  return (
    <View style={{ gap: 24 }}>
      <View style={[s.card, { padding: 22, gap: 18 }]}>
        <View style={[s.row, { gap: 12 }]}>
          <KeyRound size={24} color={c.green} />
          <Text accessibilityRole="header" style={[s.h2, { flex: 1 }]}>
            Connect your research assistant
          </Text>
        </View>
        <Text style={s.text}>
          Let an agent find useful posts and propose new ideas in your space.
          You review every draft before it becomes a post.
        </Text>
        <Text style={s.small}>
          Agents can read posts you can access and mark them useful or outdated.
          They cannot publish, change your circles, or edit goals.
        </Text>
        <Field
          label="Agent name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          editable={!disabled}
          placeholder="e.g. My research assistant"
          style={{ fontSize: 16 }}
        />
        <Action
          label="Create token"
          onPress={create}
          loading={busy === "create"}
          disabled={
            disabled || !name.trim() || (data?.connections.length ?? 0) >= 10
          }
          style={{ minHeight: 48, alignSelf: "flex-start" }}
        >
          Create token
        </Action>
        <Text style={s.small}>
          Up to 10 connections. Tokens expire after 30 days. Keep them in your
          agent’s secure credential store.
        </Text>
        <Action
          secondary
          icon={ArrowUpRight}
          onPress={() =>
            void run("docs", async () => {
              await Linking.openURL(`${apiBase}/docs`);
            })
          }
          disabled={disabled}
          style={{ minHeight: 48, alignSelf: "flex-start" }}
        >
          Read the agent API guide
        </Action>
        {!!secret && (
          <View
            style={{
              gap: 12,
              borderTopWidth: 1,
              borderColor: c.border,
              paddingTop: 18,
            }}
          >
            <Text style={s.label}>Save this token now</Text>
            <Text style={s.small}>
              Give your agent the Rabbit website address and this token. Rabbit
              cannot show it again after you leave this page.
            </Text>
            <TextInput
              accessibilityLabel="New agent token"
              value={secret}
              editable={false}
              secureTextEntry={!shown}
              selectTextOnFocus
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 9,
                padding: 12,
                minHeight: 48,
                color: c.ink,
                fontSize: 14,
              }}
            />
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              <Action
                secondary
                label={shown ? "Hide token" : "Show token"}
                onPress={() => setShown((v) => !v)}
                style={{ minHeight: 48 }}
              >
                {shown ? "Hide token" : "Show token"}
              </Action>
              <Action
                secondary
                label="Copy token"
                onPress={() =>
                  void run("copy", async () => {
                    await Clipboard.setStringAsync(secret);
                    setNotice(
                      "Token copied. Keep it in a secure credential store.",
                    );
                  })
                }
                disabled={disabled}
                style={{ minHeight: 48 }}
              >
                Copy token
              </Action>
              <Action
                secondary
                label="Done with token"
                onPress={() => {
                  setSecret("");
                  setShown(false);
                }}
                style={{ minHeight: 48 }}
              >
                Done
              </Action>
            </View>
          </View>
        )}
      </View>
      <View style={{ gap: 12 }}>
        <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
          <Text accessibilityRole="header" style={s.h2}>
            Your agents
          </Text>
          <Action
            secondary
            icon={RefreshCw}
            label="Refresh agent activity"
            onPress={() => void run("refresh", reload)}
            loading={busy === "refresh" || busy === "load"}
            disabled={disabled}
            style={{ minHeight: 48 }}
          >
            Refresh
          </Action>
        </View>
        {!!error && (errorAt !== "publish" || !draft) && (
          <View accessibilityRole="alert" style={{ gap: 10 }}>
            <Text style={s.error}>{error}</Text>
            <Action
              secondary
              label="Retry loading agents"
              onPress={() => void run("load", reload)}
              disabled={disabled}
              style={{ alignSelf: "flex-start", minHeight: 48 }}
            >
              Try again
            </Action>
          </View>
        )}
        {!!notice && (
          <Text
            accessibilityLiveRegion="polite"
            style={[s.text, { color: c.green }]}
          >
            {notice}
          </Text>
        )}
        {data?.connections.length === 0 && (
          <Text style={s.small}>
            No agents connected yet. Create a named token above to get started.
          </Text>
        )}
        {data?.connections.map((connection) => (
          <View key={connection.id} style={[s.card, { padding: 18, gap: 12 }]}>
            <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text style={s.label}>{connection.name}</Text>
                <Text style={s.small}>
                  Expires {new Date(connection.expiresAt).toLocaleDateString()}
                </Text>
              </View>
              <Action
                secondary
                icon={Trash2}
                label={`Delete token for ${connection.name}`}
                onPress={() => setRemove(connection.id)}
                disabled={disabled}
                style={{ minHeight: 48 }}
              >
                Delete
              </Action>
            </View>
            {remove === connection.id && (
              <View style={{ gap: 12 }}>
                <Text style={s.text}>
                  Delete this token? {connection.name} will lose access
                  immediately. Its activity and drafts will stay here.
                </Text>
                <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
                  <Action
                    label="Delete token"
                    onPress={() =>
                      void run("delete", async () => {
                        await request(
                          `/agents/tokens/${connection.id}`,
                          "DELETE",
                        );
                        setRemove("");
                        setSecret("");
                        setShown(false);
                        setData((old) =>
                          old
                            ? {
                                ...old,
                                connections: old.connections.filter(
                                  (c) => c.id !== connection.id,
                                ),
                              }
                            : old,
                        );
                        setNotice(
                          "Token deleted. This agent no longer has access.",
                        );
                      })
                    }
                    loading={busy === "delete"}
                    disabled={disabled}
                    style={{ minHeight: 48 }}
                  >
                    Delete token
                  </Action>
                  <Action
                    secondary
                    onPress={() => setRemove("")}
                    disabled={disabled}
                    style={{ minHeight: 48 }}
                  >
                    Keep token
                  </Action>
                </View>
              </View>
            )}
          </View>
        ))}
      </View>
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={s.h2}>
          Proposed drafts
        </Text>
        <Text style={s.small}>
          Private to you. Review, edit, then publish as a personal note.
        </Text>
        {data?.drafts.length === 0 && (
          <Text style={s.small}>No drafts waiting for you.</Text>
        )}
        {data?.drafts.map((d) => (
          <View key={d.id} style={[s.card, { padding: 22, gap: 12 }]}>
            {draft?.id === d.id ? (
              <>
                <Text style={s.small}>Proposed by {d.agentName}</Text>
                <Field
                  label="Draft title"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={180}
                  editable={!disabled}
                  style={{ fontSize: 16 }}
                />
                <Field
                  label="Draft content"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={20000}
                  editable={!disabled}
                  style={{
                    fontSize: 16,
                    minHeight: 140,
                    textAlignVertical: "top",
                  }}
                />
                <Text style={s.small}>
                  Only you will see the published note.
                </Text>
                {!!error && errorAt === "publish" && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                  <Action
                    label="Publish privately"
                    onPress={() =>
                      void run("publish", async () => {
                        await request(
                          `/agents/drafts/${d.id}/publish`,
                          "POST",
                          { title, body },
                        );
                        setDraft(null);
                        setData((old) =>
                          old
                            ? {
                                ...old,
                                drafts: old.drafts.filter((x) => x.id !== d.id),
                              }
                            : old,
                        );
                        setNotice("Draft published. Only you can see it.");
                      })
                    }
                    loading={busy === "publish"}
                    disabled={disabled || !title.trim()}
                    style={{ minHeight: 48 }}
                  >
                    Publish privately
                  </Action>
                  <Action
                    secondary
                    onPress={() => setDraft(null)}
                    disabled={disabled}
                    style={{ minHeight: 48 }}
                  >
                    Close review
                  </Action>
                </View>
              </>
            ) : (
              <>
                <Text style={s.h2}>{d.title}</Text>
                <Text style={s.small}>Proposed by {d.agentName}</Text>
                <Text numberOfLines={3} style={s.text}>
                  {d.body}
                </Text>
                <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                  <Action
                    secondary
                    label={`Review ${d.title}`}
                    onPress={() => {
                      setDraft(d);
                      setTitle(d.title);
                      setBody(d.body);
                    }}
                    disabled={disabled}
                    style={{ minHeight: 48 }}
                  >
                    Review draft
                  </Action>
                  <Action
                    secondary
                    label={`Dismiss ${d.title}`}
                    onPress={() =>
                      void run("dismiss", async () => {
                        await request(`/agents/drafts/${d.id}/dismiss`, "POST");
                        setData((old) =>
                          old
                            ? {
                                ...old,
                                drafts: old.drafts.filter((x) => x.id !== d.id),
                              }
                            : old,
                        );
                        setNotice("Draft dismissed.");
                      })
                    }
                    disabled={disabled}
                    style={{ minHeight: 48 }}
                  >
                    Dismiss
                  </Action>
                </View>
              </>
            )}
          </View>
        ))}
      </View>
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={s.h2}>
          Recent activity
        </Text>
        <Text style={s.small}>
          Latest 200 events from the last 30 days. Reads are summarized once per
          day; each successful write is recorded.
        </Text>
        {data?.activity.length === 0 && (
          <Text style={s.small}>
            When an agent uses Rabbit, you’ll see its activity here.
          </Text>
        )}
        {data?.activity.map((event) => (
          <View
            key={event.id}
            style={{
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: c.border,
              gap: 5,
            }}
          >
            <Text style={s.text}>{event.detail}</Text>
            <Text style={s.small}>
              {event.agentName} · {new Date(event.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

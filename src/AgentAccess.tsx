import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Copy, KeyRound, LockKeyhole } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { agentEndpoint, request } from "./api";
import type { AgentProposal } from "./agent";
import { Sheet } from "./Sheet";
import { colors as c, s } from "./theme";
import { Action } from "./ui";

type Connection = { expiresAt: string | null; token?: string };

export function AgentAccess({
  onClose,
  onApprove,
}: {
  onClose: () => void;
  onApprove: () => Promise<unknown>;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [proposals, setProposals] = useState<AgentProposal[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(
    null,
  );
  const setupPrompt =
    agentEndpoint && connection?.token
      ? [
          "Please connect my Rabbit account to your MCP client. Add a server named rabbit using the settings below.",
          "",
          `URL: ${agentEndpoint}`,
          "Transport: Streamable HTTP",
          `Authorization: Bearer ${connection.token}`,
          "",
          "Set Authorization as an HTTP request header. Use your client's secret storage for the key if available and keep it out of logs, replies, and shared files.",
          "Connect and run tools/list to verify that the Rabbit tools are available.",
        ].join("\n")
      : null;

  async function refresh() {
    const [access, pending] = await Promise.all([
      request<Connection>("/agent/connection"),
      request<AgentProposal[]>("/agent/proposals"),
    ]);
    setConnection((previous) =>
      previous?.expiresAt === access.expiresAt ? previous : access,
    );
    setProposals(pending);
  }

  async function run(action: string, work: () => Promise<void>) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again in a moment.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void run("refresh", refresh);
  }, []);

  async function copySetup(prompt: string) {
    try {
      const copied = await Clipboard.setStringAsync(prompt, {
        android: { isSensitive: true },
      });
      setCopyStatus(copied ? "copied" : "failed");
    } catch {
      setCopyStatus("failed");
    }
  }

  async function review(proposal: AgentProposal, approve: boolean) {
    await request(
      `/agent/proposals/${proposal.id}`,
      approve ? "POST" : "DELETE",
    );
    setProposals(
      (pending) => pending?.filter((p) => p.id !== proposal.id) ?? [],
    );
    setNotice(
      approve
        ? proposal.kind === "post"
          ? "Private post created."
          : "Private goal created."
        : "Proposal dismissed.",
    );
    if (approve) await onApprove();
  }

  return (
    <Sheet title="Agent access" onClose={onClose}>
      <View style={{ gap: 24 }}>
        <View style={{ gap: 10 }}>
          <Text style={s.h2} accessibilityRole="header">
            Connect an agent
          </Text>
          <Text style={s.small}>
            Your agent can read posts and goals you can access and send you
            proposals to review.
          </Text>
          <Text style={s.label}>MCP server URL</Text>
          <Text selectable style={s.small}>
            {agentEndpoint}
          </Text>
          {connection?.expiresAt && (
            <Text style={s.small}>
              Key active until{" "}
              {new Date(connection.expiresAt).toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
              .
            </Text>
          )}
          {connection?.token && (
            <View
              style={{
                gap: 6,
                padding: 12,
                borderRadius: 9,
                backgroundColor: c.sidebar,
              }}
            >
              <Text style={s.label}>Agent key</Text>
              <Text accessibilityLabel="Agent key" selectable style={s.small}>
                {connection.token}
              </Text>
              <Text style={s.small}>
                The setup prompt includes this key. Paste it into a private
                conversation with the agent you want to connect.
              </Text>
              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                {setupPrompt && (
                  <Action
                    icon={Copy}
                    disabled={!!busy}
                    onPress={() =>
                      void run("copy", () => copySetup(setupPrompt))
                    }
                  >
                    Copy setup prompt
                  </Action>
                )}
                <Action
                  secondary
                  disabled={!!busy}
                  onPress={() => {
                    setConnection({ expiresAt: connection.expiresAt });
                    setCopyStatus(null);
                  }}
                >
                  Hide key
                </Action>
              </View>
              {copyStatus === "copied" && (
                <Text accessibilityLiveRegion="polite" style={s.small}>
                  Setup prompt copied.
                </Text>
              )}
              {copyStatus === "failed" && (
                <>
                  <Text accessibilityRole="alert" style={s.error}>
                    Couldn’t access the clipboard. Select and copy the prompt
                    below.
                  </Text>
                  <Text selectable style={s.small}>
                    {setupPrompt}
                  </Text>
                </>
              )}
            </View>
          )}
          {connection && (
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              <Action
                icon={KeyRound}
                secondary={!!setupPrompt}
                loading={busy === "key"}
                disabled={!!busy}
                onPress={() =>
                  void run("key", async () => {
                    setConnection(
                      await request<Connection>("/agent/connection", "POST"),
                    );
                    setCopyStatus(null);
                  })
                }
              >
                {connection.expiresAt ? "Replace key" : "Create key"}
              </Action>
              {connection.expiresAt && (
                <Action
                  secondary
                  disabled={!!busy}
                  onPress={() =>
                    void run("revoke", async () => {
                      setConnection(
                        await request<Connection>(
                          "/agent/connection",
                          "DELETE",
                        ),
                      );
                      setNotice("Agent key revoked.");
                    })
                  }
                >
                  Revoke key
                </Action>
              )}
            </View>
          )}
          {connection?.expiresAt && (
            <Text style={s.small}>
              Replacing the key disconnects the current agent.
            </Text>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
            <Text accessibilityRole="header" style={s.h2}>
              Proposals
            </Text>
            <Action
              secondary
              loading={busy === "refresh"}
              disabled={!!busy}
              onPress={() => void run("refresh", refresh)}
            >
              Refresh proposals
            </Action>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={s.small}>
              {notice}
            </Text>
          ) : null}
          {proposals?.length === 0 && (
            <Text style={s.small}>No proposals to review.</Text>
          )}
          {proposals?.map((proposal) => (
            <View
              key={proposal.id}
              style={{
                gap: 8,
                borderTopWidth: 1,
                borderColor: c.border,
                paddingTop: 12,
              }}
            >
              <Text style={s.small}>
                {proposal.kind === "post" ? "Post draft" : "Goal suggestion"}
              </Text>
              <Text style={s.label}>{proposal.title}</Text>
              {proposal.description ? (
                <Text style={s.text}>{proposal.description}</Text>
              ) : null}
              <View style={[s.row, { gap: 6 }]}>
                <LockKeyhole size={14} color={c.muted} />
                <Text style={s.small}>Only you can see it after approval.</Text>
              </View>
              <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
                <Action
                  disabled={!!busy}
                  onPress={() =>
                    void run(proposal.id, () => review(proposal, true))
                  }
                >
                  {proposal.kind === "post"
                    ? "Approve private post"
                    : "Approve private goal"}
                </Action>
                <Action
                  secondary
                  disabled={!!busy}
                  onPress={() =>
                    void run(proposal.id, () => review(proposal, false))
                  }
                >
                  Dismiss
                </Action>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

export type AgentConnection = {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
export type AgentDraft = {
  id: string;
  connectionId: string;
  agentName: string;
  title: string;
  body: string;
  createdAt: string;
  status: "pending" | "published" | "dismissed";
  postId?: string;
};
export type AgentActivity = {
  id: string;
  connectionId: string;
  agentName: string;
  action: "read" | "feedback" | "draft" | "publish" | "dismiss";
  createdAt: string;
  targetId?: string;
  detail: string;
};
export type AgentAccount = {
  ownerId: string;
  connections: (AgentConnection & { hash: string })[];
  drafts: AgentDraft[];
  activity: AgentActivity[];
  lastReadDay?: string;
  windowStart: number;
  requests: number;
};
export type AgentOverview = {
  connections: AgentConnection[];
  drafts: AgentDraft[];
  activity: AgentActivity[];
};

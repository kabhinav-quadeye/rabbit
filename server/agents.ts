import { randomBytes, randomUUID, createHash } from "node:crypto";
import { AppError, createService } from "../src/domain.ts";
import type { State } from "../src/types.ts";
import type {
  AgentAccount,
  AgentActivity,
  AgentConnection,
} from "../src/agent-types.ts";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const agentRequest = (path: string) => /^\/api\/agent\//.test(path);
export const managementRequest = (path: string) =>
  /^\/api\/agents(?:\/|$)/.test(path);
const fail = (message: string, status = 400): never => {
  throw new AppError(message, status);
};
const text = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    return fail(`${label} must be 1–${max} characters.`);
  return value.trim();
};
export function agentOwner(state: State, token: string, time = new Date()) {
  const hash = hashToken(token);
  const account = state.agentAccounts?.find((a) =>
    a.connections.some(
      (c) =>
        c.hash === hash && !c.revokedAt && c.expiresAt > time.toISOString(),
    ),
  );
  if (!account) return fail("Agent token is invalid, expired or revoked.", 401);
  return account.ownerId;
}
export function handleAgents(
  state: State,
  ownerId: string,
  path: string,
  method: string,
  input: any = {},
  token?: string,
  now = new Date(),
) {
  if (!state.users.some((u) => u.id === ownerId))
    return fail("User not found.", 401);
  const stamp = now.toISOString();
  state.agentAccounts ??= [];
  let a = state.agentAccounts.find((a) => a.ownerId === ownerId);
  if (!a) {
    a = {
      ownerId,
      connections: [],
      drafts: [],
      activity: [],
      windowStart: 0,
      requests: 0,
    };
    state.agentAccounts.push(a);
  }
  a.activity = a.activity.filter(
    (e) => e.createdAt > new Date(now.getTime() - 30 * 86400000).toISOString(),
  );
  // Keep the account document bounded, including dormant/revoked connections.
  a.drafts = [
    ...a.drafts.filter((d) => d.status === "pending"),
    ...a.drafts.filter((d) => d.status !== "pending").slice(-20),
  ];
  a.connections = a.connections.filter(
    (c) => !c.revokedAt && c.expiresAt > stamp,
  );
  let current: AgentAccount["connections"][number] | undefined;
  if (agentRequest(path)) {
    if (!token || agentOwner(state, token, now) !== ownerId)
      return fail("Agent token required.", 401);
    current = a.connections.find((c) => c.hash === hashToken(token))!;
    if (now.getTime() - a.windowStart >= 60000) {
      a.windowStart = now.getTime();
      a.requests = 0;
    }
    if (a.requests >= 60)
      return fail("Agent request limit reached. Try again in a minute.", 429);
    a.requests++;
  }
  const log = (
    action: AgentActivity["action"],
    detail: string,
    targetId?: string,
    connectionId = current?.id,
    agentName = current?.name,
  ) => {
    if (action === "read") {
      const day = stamp.slice(0, 10);
      if (a.lastReadDay === day) return;
      a.lastReadDay = day;
    }
    a.activity.push({
      id: randomUUID(),
      connectionId: connectionId!,
      agentName: agentName!,
      action,
      detail,
      createdAt: stamp,
      ...(targetId ? { targetId } : {}),
    });
    // A bounded recent history also prevents a busy agent exceeding Firestore's document limit.
    a.activity = a.activity.slice(-200);
  };
  const publicConnection = ({
    hash,
    ...c
  }: AgentAccount["connections"][number]): AgentConnection => c;
  let latest = state;
  const service = createService(state, (next) => {
    latest = next;
  });

  if (path === "/api/agents" && method === "GET")
    return {
      connections: a.connections.map(publicConnection),
      drafts: a.drafts.filter((d) => d.status === "pending"),
      activity: [...a.activity].reverse(),
    };
  if (path === "/api/agents/tokens" && method === "POST") {
    const name = text(input.name, "Agent name", 60);
    if (a.connections.length >= 10)
      return fail("You can connect up to 10 agents. Delete one first.");
    const token = `rba_${randomBytes(32).toString("hex")}`;
    const c = {
      id: randomUUID(),
      name,
      hash: hashToken(token),
      createdAt: stamp,
      expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
      revokedAt: null,
    };
    a.connections.push(c);
    return { token, connection: publicConnection(c) };
  }
  const remove = path.match(/^\/api\/agents\/tokens\/([^/]+)$/);
  if (remove && method === "DELETE") {
    const c =
      a.connections.find((c) => c.id === remove[1]) ??
      fail("Connection not found.", 404);
    a.connections = a.connections.filter((other) => other.id !== c.id);
    return { ok: true };
  }
  const review = path.match(
    /^\/api\/agents\/drafts\/([^/]+)\/(publish|dismiss)$/,
  );
  if (review && method === "POST") {
    const d =
      a.drafts.find((d) => d.id === review[1]) ?? fail("Draft not found.", 404);
    if (review[2] === "dismiss") {
      if (d.status === "published")
        return fail("This draft was already published.", 409);
      d.status = "dismissed";
      d.body = "";
      log("dismiss", "Dismissed draft", d.id, d.connectionId, d.agentName);
      return { ok: true };
    }
    if (d.status === "published")
      return (
        state.posts.find((p) => p.id === d.postId) ??
        fail("Published post not found.", 404)
      );
    if (d.status !== "pending") return fail("This draft was dismissed.", 409);
    const p = service.createPost(ownerId, {
      title: input.title ?? d.title,
      body: input.body ?? d.body,
      audienceType: "self",
    });
    // createService clones state; persist its post changes together with the review record.
    state.posts = latest.posts;
    d.status = "published";
    d.body = "";
    d.postId = p.id;
    log(
      "publish",
      "Published draft privately",
      p.id,
      d.connectionId,
      d.agentName,
    );
    return p;
  }
  if (!current) return fail("Not found.", 404);
  if (path === "/api/agent/search" && method === "GET") {
    const results = service.search(
      ownerId,
      String(input.q ?? "").slice(0, 500),
      String(input.scope ?? "all"),
    );
    const offset = Number(input.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      return fail("Offset must be a non-negative integer.");
    log("read", "Read or searched posts");
    return results.slice(offset, offset + 20);
  }
  const post = path.match(/^\/api\/agent\/posts\/([^/]+)(\/feedback)?$/);
  if (post) {
    const p =
      service.bootstrap(ownerId).posts.find((p) => p.id === post[1]) ??
      fail("You do not have access to this post.", 403);
    if (!post[2] && method === "GET") {
      log("read", "Read or searched posts");
      return p;
    }
    if (post[2] && method === "PUT") {
      if (
        !["useful", "outdated"].includes(input.kind) ||
        typeof input.active !== "boolean"
      )
        return fail("Choose useful or outdated and a boolean active value.");
      const field = input.kind === "useful" ? "votes" : "outdatedBy";
      let updated = p;
      if ((p[field] ?? []).includes(ownerId) !== input.active)
        updated =
          input.kind === "useful"
            ? service.toggleVote(ownerId, p.id)
            : service.toggleOutdated(ownerId, p.id);
      // Preserve the live account object containing audit and request-budget changes.
      state.posts = latest.posts;
      log(
        "feedback",
        `${input.active ? "Marked" : "Removed"} ${input.kind}`,
        p.id,
      );
      return updated;
    }
  }
  if (path === "/api/agent/drafts" && method === "POST") {
    if (a.drafts.filter((d) => d.status === "pending").length >= 20)
      return fail("You have 20 drafts waiting for review. Review one first.");
    const d = {
      id: randomUUID(),
      connectionId: current.id,
      agentName: current.name,
      title: text(input.title, "Title", 180),
      body: text(input.body, "Draft", 20000),
      createdAt: stamp,
      status: "pending" as const,
    };
    a.drafts = a.drafts.filter(
      (d) =>
        d.status === "pending" ||
        d.createdAt > new Date(now.getTime() - 30 * 86400000).toISOString(),
    );
    if (Buffer.byteLength(JSON.stringify([...a.drafts, d]), "utf8") > 400000)
      return fail(
        "Your draft storage is full. Review or dismiss a draft first.",
      );
    a.drafts.push(d);
    log("draft", "Proposed a draft", d.id);
    return d;
  }
  return fail("This operation is not allowed for agents.", 403);
}

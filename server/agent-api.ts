import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "./domain.ts";
import {
  goalTaskReviewPath,
  parseGoalTaskSuggestion,
  validWebFetchGoalId,
} from "../src/goal-webfetch.ts";
import { handleMcp, type AgentTools } from "./mcp.ts";

type Result<T> = T | Promise<T>;
export type AgentKeyStore = {
  expires(uid: string): Result<number | undefined>;
  replace(uid: string, hash: string, expires: number): Result<unknown>;
  revoke(uid: string): Result<unknown>;
  owner(hash: string): Result<string | undefined>;
};

export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function readJsonBody(req: IncomingMessage) {
  let value = "";
  for await (const chunk of req) {
    value += chunk;
    if (Buffer.byteLength(value) > 65536)
      throw new AppError("This request is too large.", 413);
  }
  try {
    const result = JSON.parse(value || "{}");
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    throw new AppError("Send a valid JSON object.");
  }
}

export function sendJson(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

const webFetchKeyPrefix = "webfetch:";
export type AgentEndpoint = "mcp" | "connection" | "goals" | "goal-suggestions";

async function serveGoalWebFetch(
  req: IncomingMessage,
  res: ServerResponse,
  endpoint: "goals" | "goal-suggestions",
  keys: AgentKeyStore,
  authenticate: (req: IncomingMessage) => Result<string>,
  actions: (uid: string) => AgentTools,
) {
  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const method = req.method;
  const canManage = endpoint === "goals";
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (canManage && method === "OPTIONS") {
    res
      .writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      })
      .end();
    return;
  }
  if (canManage && (method === "POST" || method === "DELETE")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const uid = await authenticate(req);
    const keyId = webFetchKeyPrefix + uid;
    if (method === "DELETE") {
      await keys.revoke(keyId);
      sendJson(res, { expiresAt: null });
      return;
    }
    const { goalId } = await readJsonBody(req);
    if (!validWebFetchGoalId(goalId))
      throw new AppError("Choose a valid goal.");
    await actions(uid).goal(goalId, false);
    const token = `rg_${randomBytes(32).toString("hex")}`;
    const expires = Date.now() + 15 * 60 * 1000;
    await keys.replace(keyId, digest(`${goalId}:${token}`), expires);
    sendJson(
      res,
      { goalId, token, expiresAt: new Date(expires).toISOString() },
      201,
    );
    return;
  }

  if (method !== "GET") {
    res.setHeader("Allow", canManage ? "GET, POST, DELETE, OPTIONS" : "GET");
    throw new AppError("Method not allowed.", 405);
  }
  const goalId = query.get("goalId");
  const token = query.get("token");
  const keyId =
    validWebFetchGoalId(goalId) && token && /^rg_[a-f0-9]{64}$/.test(token)
      ? await keys.owner(digest(`${goalId}:${token}`))
      : undefined;
  if (!keyId?.startsWith(webFetchKeyPrefix) || !goalId)
    throw new AppError("Supply an active WebFetch token for this goal.", 401);
  const uid = keyId.slice(webFetchKeyPrefix.length);
  if (endpoint === "goal-suggestions") {
    const suggestion = parseGoalTaskSuggestion(query);
    if (!suggestion) throw new AppError("Enter a task of 1–500 characters.");
    await actions(uid).goal(goalId, false);
    sendJson(res, { reviewPath: goalTaskReviewPath(suggestion) });
    return;
  }
  const offset = Number(query.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 500)
    throw new AppError("Choose a task offset from 0 to 500.");
  const { goal, tasks } = await actions(uid).goal(goalId, true);
  tasks.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const end = offset + 10;
  sendJson(res, {
    goal: {
      id: goal.id,
      title: goal.title,
      why: goal.why,
      status: goal.status,
    },
    tasks: tasks
      .slice(offset, end)
      .map(({ id, parentId, description, priority, dueDate, status }) => ({
        id,
        parentId,
        description,
        priority,
        dueDate,
        status,
      })),
    nextOffset: end < tasks.length ? end : null,
  });
}

export async function serveAgent(
  req: IncomingMessage,
  res: ServerResponse,
  endpoint: AgentEndpoint,
  keys: AgentKeyStore,
  authenticate: (req: IncomingMessage) => Result<string>,
  actions: (uid: string) => AgentTools,
) {
  try {
    if (endpoint === "goals" || endpoint === "goal-suggestions") {
      await serveGoalWebFetch(req, res, endpoint, keys, authenticate, actions);
      return;
    }
    if (endpoint === "mcp") {
      if (req.headers.origin)
        throw new AppError(
          "Browser origins are not supported on this endpoint.",
          403,
        );
      const token = req.headers.authorization?.match(
        /^Bearer (rabbit_[a-f0-9]{64})$/,
      )?.[1];
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      const uid = token && (await keys.owner(digest(token)));
      if (!uid || uid.startsWith(webFetchKeyPrefix)) {
        res.setHeader("WWW-Authenticate", "Bearer");
        throw new AppError("Supply an active Rabbit agent key.", 401);
      }
      // These stateless endpoints only return JSON responses to POST requests.
      // A GET event stream would hold open a function with no events to send.
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        throw new AppError("Method not allowed.", 405);
      }
      const input = await readJsonBody(req);
      await handleMcp(req, res, input, actions(uid));
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const uid = await authenticate(req);
    if (req.method === "GET") {
      const expires = await keys.expires(uid);
      sendJson(res, {
        expiresAt:
          expires && expires > Date.now()
            ? new Date(expires).toISOString()
            : null,
      });
    } else if (req.method === "POST") {
      const token = `rabbit_${randomBytes(32).toString("hex")}`;
      const expires = Date.now() + 30 * 86400000;
      await keys.replace(uid, digest(token), expires);
      sendJson(res, { token, expiresAt: new Date(expires).toISOString() }, 201);
    } else if (req.method === "DELETE") {
      await keys.revoke(uid);
      sendJson(res, { expiresAt: null });
    } else {
      throw new AppError("Method not allowed.", 405);
    }
  } catch (error) {
    if (error instanceof AppError && !res.headersSent) {
      sendJson(res, { error: error.message }, error.status);
    } else {
      console.error(
        "Rabbit agent request failed",
        error instanceof Error ? error.name : "Unknown error",
      );
      if (!res.headersSent)
        sendJson(
          res,
          { error: "Rabbit could not complete this request." },
          500,
        );
      else if (!res.writableEnded) res.end();
    }
  }
}

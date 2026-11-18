import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "./domain.ts";
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

export async function serveAgent(
  req: IncomingMessage,
  res: ServerResponse,
  endpoint: "mcp" | "connection",
  keys: AgentKeyStore,
  authenticate: (req: IncomingMessage) => Result<string>,
  actions: (uid: string) => AgentTools,
) {
  try {
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
      if (!uid) {
        res.setHeader("WWW-Authenticate", "Bearer");
        throw new AppError("Supply an active Rabbit agent key.", 401);
      }
      const input = req.method === "POST" ? await readJsonBody(req) : undefined;
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

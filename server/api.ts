import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { AppError, createService } from "./domain.ts";
import { loginEmail } from "../src/identity.ts";
import { seedState } from "./seed.ts";
import type { State } from "../src/types.ts";

import {
  agentOwner,
  agentRequest,
  managementRequest,
  handleAgents,
} from "./agents.ts";

type Options = {
  dbPath?: string;
  firebaseAgents?: boolean;
  seed?: boolean;
  demoEnabled?: boolean;
  staticDir?: string;
};
export function createApi(options: Options = {}) {
  let firebaseGateway:
    | ((
        path: string,
        method: string,
        input: unknown,
        token: string,
      ) => Promise<unknown>)
    | undefined;
  const demoEnabled =
    !options.firebaseAgents &&
    (options.demoEnabled ??
      (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "0"));
  const db = new DatabaseSync(options.dbPath ?? "data/rabbit.sqlite");
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credentials (email TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);`,
  );
  const row = db.prepare("SELECT data FROM app_state WHERE id=1").get() as
    { data: string } | undefined;
  let state: State = row
    ? JSON.parse(row.data)
    : (options.seed ?? demoEnabled) === false
      ? { users: [], groups: [], posts: [] }
      : seedState();
  const save = (next: State) => {
    state = next;
    db.prepare(
      "INSERT INTO app_state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(JSON.stringify(next));
  };
  save(state);
  let service = createService(state, save);
  const digest = (token: string) =>
    createHash("sha256").update(token).digest("hex");
  const session = (id: string) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      digest(token),
      id,
      Date.now() + 30 * 86400000,
    );
    return token;
  };
  const auth = (req: IncomingMessage) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const entry = db
      .prepare("SELECT user_id FROM sessions WHERE hash=? AND expires>?")
      .get(digest(token), Date.now()) as { user_id: string } | undefined;
    if (!entry)
      throw new AppError("Your session has ended. Please sign in again.", 401);
    return entry.user_id;
  };
  const body = async (req: IncomingMessage) => {
    let value = "";
    for await (const chunk of req) {
      value += chunk;
      if (Buffer.byteLength(value) > 65536)
        throw new AppError("This post is too large.", 413);
    }
    try {
      const result = JSON.parse(value || "{}");
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw 0;
      return result;
    } catch {
      throw new AppError("Send a valid JSON object.");
    }
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const send = (data: unknown, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (
        path === "/AGENTS.md" ||
        path === "/docs" ||
        path === "/docs/agents.md"
      ) {
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          await readFile(
            new URL(
              path === "/AGENTS.md"
                ? "../docs/agent-guide.md"
                : "../docs/agent-api.md",
              import.meta.url,
            ),
          ),
        );
        return;
      }
      // Finish asynchronous input parsing before reading credentials or mutable state.
      const input =
        req.method === "GET" || req.method === "HEAD" ? {} : await body(req);
      if (agentRequest(path) || managementRequest(path)) {
        const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        if (options.firebaseAgents) {
          firebaseGateway ??= (
            await import("./firebase-agents.ts")
          ).createFirebaseAgentGateway();
          const data = await firebaseGateway(
            path,
            req.method ?? "GET",
            req.method === "GET" ? Object.fromEntries(url.searchParams) : input,
            token,
          );
          send(
            data,
            req.method === "POST" &&
              ["/api/agents/tokens", "/api/agent/drafts"].includes(path)
              ? 201
              : 200,
          );
          return;
        }
        const owner = agentRequest(path) ? agentOwner(state, token) : auth(req);
        const next = structuredClone(state);
        try {
          const result = handleAgents(
            next,
            owner,
            path,
            req.method ?? "GET",
            req.method === "GET" ? Object.fromEntries(url.searchParams) : input,
            token,
          );
          save(next);
          service = createService(state, save);
          send(
            result,
            req.method === "POST" &&
              ["/api/agents/tokens", "/api/agent/drafts"].includes(path)
              ? 201
              : 200,
          );
        } catch (error) {
          // Failed calls consume their budget but cannot persist a partial mutation.
          const account = next.agentAccounts?.find((a) => a.ownerId === owner);
          const original = state.agentAccounts?.find(
            (a) => a.ownerId === owner,
          );
          if (account && original) {
            original.requests = account.requests;
            original.windowStart = account.windowStart;
            save(state);
            service = createService(state, save);
          }
          throw error;
        }
        return;
      }
      if (!path.startsWith("/api/")) {
        if (!options.staticDir) throw new AppError("Not found.", 404);
        const root = resolve(options.staticDir);
        let file = resolve(root, `.${decodeURIComponent(path)}`);
        if (!(file === root || file.startsWith(root + sep)))
          throw new AppError("Not found.", 404);
        if (!(await stat(file).catch(() => null))?.isFile())
          file = resolve(root, "index.html");
        const mime: Record<string, string> = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".ttf": "font/ttf",
          ".woff2": "font/woff2",
          ".json": "application/json",
        };
        res.writeHead(200, {
          "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        });
        res.end(await readFile(file));
        return;
      }
      if (path === "/api/health" && req.method === "GET") {
        send({ ok: true, demo: demoEnabled });
        return;
      }
      if (options.firebaseAgents) throw new AppError("Not found.", 404);
      if (path === "/api/auth/demo" && req.method === "POST") {
        if (!demoEnabled || !state.users.some((u) => u.id === "alex"))
          throw new AppError("Not found.", 404);
        send({
          token: session("alex"),
          user: service.bootstrap("alex").currentUser,
        });
        return;
      }
      if (
        ["/api/auth/register", "/api/auth/login"].includes(path) &&
        req.method === "POST"
      ) {
        const key = req.socket.remoteAddress ?? "local";
        const current = attempts.get(key);
        if (current && current.until > Date.now() && current.count >= 30)
          throw new AppError(
            "Too many attempts. Please try again in a minute.",
            429,
          );
        attempts.set(key, {
          count: current && current.until > Date.now() ? current.count + 1 : 1,
          until:
            current && current.until > Date.now()
              ? current.until
              : Date.now() + 60000,
        });
        let email: string;
        try {
          email = loginEmail(String(input.email ?? ""));
        } catch {
          throw new AppError("Enter a valid username or email address.");
        }
        const password = input.password;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
          throw new AppError("Enter a valid email address.");
        if (
          typeof password !== "string" ||
          password.length < 8 ||
          password.length > 200
        )
          throw new AppError("Use a password between 8 and 200 characters.");
        if (path.endsWith("/register")) {
          const name = String(input.name ?? "").trim();
          if (!name || name.length > 60)
            throw new AppError("Enter a name of 1–60 characters.");
          if (
            db.prepare("SELECT email FROM credentials WHERE email=?").get(email)
          )
            throw new AppError(
              "An account with this email already exists. Sign in instead.",
              409,
            );
          const handle = email.split("@")[0];
          if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(handle))
            throw new AppError(
              "Use a username of 3–40 letters, numbers, dots, underscores or hyphens.",
            );
          if (state.users.some((u) => u.handle.toLowerCase() === handle))
            throw new AppError(
              "This username is taken. Choose another username.",
              409,
            );
          const id = randomUUID();
          const salt = randomBytes(16).toString("hex");
          db.prepare("INSERT INTO credentials VALUES(?,?,?,?)").run(
            email,
            id,
            salt,
            scryptSync(password, salt, 64).toString("hex"),
          );
          save({
            ...state,
            users: [
              ...state.users,
              {
                id,
                name,
                email,
                handle,
                bio: "",
                color: "sage",
              },
            ],
          });
          service = createService(state, save);
          send(
            { token: session(id), user: service.bootstrap(id).currentUser },
            201,
          );
          return;
        }
        const credential = db
          .prepare("SELECT * FROM credentials WHERE email=?")
          .get(email) as
          { user_id: string; salt: string; hash: string } | undefined;
        const hash = scryptSync(
          password,
          credential?.salt ?? "invalid-account-salt",
          64,
        );
        if (
          !credential ||
          !timingSafeEqual(hash, Buffer.from(credential.hash, "hex"))
        )
          throw new AppError("Email or password is incorrect.", 401);
        send({
          token: session(credential.user_id),
          user: service.bootstrap(credential.user_id).currentUser,
        });
        return;
      }
      const id = auth(req);
      if (path === "/api/auth/logout" && req.method === "POST") {
        db.prepare("DELETE FROM sessions WHERE hash=?").run(
          digest(req.headers.authorization!.replace(/^Bearer /, "")),
        );
        send({ ok: true });
        return;
      }
      if (path === "/api/bootstrap" && req.method === "GET") {
        send(service.bootstrap(id));
        return;
      }
      if (path === "/api/search" && req.method === "GET") {
        send(
          service.search(
            id,
            url.searchParams.get("q") ?? "",
            url.searchParams.get("scope") ?? "all",
          ),
        );
        return;
      }
      if (path === "/api/users" && req.method === "GET") {
        send(service.findUsers(id, url.searchParams.get("q") ?? ""));
        return;
      }
      if (path === "/api/friends/requests" && req.method === "POST") {
        send(service.sendFriendRequest(id, input.recipientId), 201);
        return;
      }
      const friendMatch = path.match(/^\/api\/friends\/requests\/([^/]+)$/);
      if (friendMatch && req.method === "PATCH") {
        send(
          service.respondToFriendRequest(
            id,
            decodeURIComponent(friendMatch[1]),
            input.status,
          ),
        );
        return;
      }
      if (path === "/api/posts" && req.method === "POST") {
        send(service.createPost(id, input), 201);
        return;
      }
      if (path === "/api/groups" && req.method === "POST") {
        send(service.createGroup(id, input), 201);
        return;
      }
      if (path === "/api/profile" && req.method === "PATCH") {
        send(service.updateProfile(id, input));
        return;
      }
      const groupMatch = path.match(/^\/api\/groups\/([^/]+)\/members$/);
      if (groupMatch && req.method === "POST") {
        send(service.addMembers(id, groupMatch[1], input.memberIds));
        return;
      }
      const postMatch = path.match(
        /^\/api\/posts\/([^/]+)\/(save|vote|outdated|comments)$/,
      );
      if (postMatch && req.method === "POST") {
        send(
          postMatch[2] === "save"
            ? service.toggleSave(id, postMatch[1])
            : postMatch[2] === "vote"
              ? service.toggleVote(id, postMatch[1])
              : postMatch[2] === "outdated"
                ? service.toggleOutdated(id, postMatch[1])
                : service.addComment(id, postMatch[1], input.body),
        );
        return;
      }
      if (path === "/api/goals" && req.method === "GET") {
        send(service.goalsOverview(id));
        return;
      }
      if (path === "/api/goals" && req.method === "POST") {
        send(service.createGoal(id, input), 201);
        return;
      }
      const goalMatch = path.match(/^\/api\/goals\/([^/]+)(\/tasks)?$/);
      if (goalMatch && goalMatch[2] && req.method === "POST") {
        send(service.createTask(id, goalMatch[1], input), 201);
        return;
      }
      if (goalMatch && !goalMatch[2] && req.method === "PATCH") {
        send(service.updateGoal(id, goalMatch[1], input));
        return;
      }
      if (goalMatch && !goalMatch[2] && req.method === "DELETE") {
        send(service.deleteGoal(id, goalMatch[1]));
        return;
      }
      const taskMatch = path.match(
        /^\/api\/tasks\/([^/]+)(?:\/(complete|reopen))?$/,
      );
      if (taskMatch && taskMatch[2] && req.method === "POST") {
        send(
          taskMatch[2] === "complete"
            ? service.completeTask(id, taskMatch[1], input.cascade === true)
            : service.reopenTask(id, taskMatch[1]),
        );
        return;
      }
      if (taskMatch && !taskMatch[2] && req.method === "PATCH") {
        send(service.updateTask(id, taskMatch[1], input));
        return;
      }
      if (taskMatch && !taskMatch[2] && req.method === "DELETE") {
        send(service.deleteTask(id, taskMatch[1]));
        return;
      }
      throw new AppError("Not found.", 404);
    } catch (e) {
      if (e instanceof AppError) send({ error: e.message }, e.status);
      else {
        console.error(e);
        send({ error: "Something went wrong. Please try again." }, 500);
      }
    }
  });
  return { server, close: () => db.close() };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "../server/api.ts";

async function start(
  dbPath = ":memory:",
  options: { seed?: boolean; demoEnabled?: boolean } = {
    seed: false,
    demoEnabled: false,
  },
) {
  const app = createApi({ dbPath, ...options });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address() as { port: number };
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) => {
    const r = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: (await r.json()) as any };
  };
  return {
    call,
    stop: async () => {
      app.server.close();
      await once(app.server, "close");
      app.close();
    },
  };
}
const account = (name: string) => ({
  name,
  email: `${name.toLowerCase()}@example.com`,
  password: "test-password-123",
});

test("API requires authentication and never accepts a user id as a token", async () => {
  const app = await start();
  try {
    assert.equal((await app.call("/bootstrap")).status, 401);
    assert.equal(
      (await app.call("/bootstrap", "GET", undefined, "alice")).status,
      401,
    );
    assert.equal((await app.call("/auth/demo", "POST", {})).status, 404);
  } finally {
    await app.stop();
  }
});
test("registration, login, access checks, search and logout work through HTTP", async () => {
  const app = await start();
  try {
    const alice = await app.call("/auth/register", "POST", account("Alice"));
    assert.equal(alice.status, 201);
    const bob = await app.call("/auth/register", "POST", account("Bob"));
    const at = alice.data.token,
      bt = bob.data.token;
    assert.equal(
      (
        await app.call("/auth/login", "POST", {
          email: "alice@example.com",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (await app.call("/auth/login", "POST", account("Alice"))).status,
      200,
    );
    assert.equal(
      (await app.call("/auth/register", "POST", account("Alice"))).status,
      409,
    );
    const post = await app.call(
      "/posts",
      "POST",
      { title: "My secret book", body: "Private", audienceType: "self" },
      at,
    );
    assert.equal(post.status, 201);
    assert.equal(
      (await app.call("/search?q=secret", "GET", undefined, bt)).data.length,
      0,
    );
    assert.equal(
      (await app.call(`/posts/${post.data.id}/save`, "POST", {}, bt)).status,
      403,
    );
    const group = await app.call(
      "/groups",
      "POST",
      { name: "Readers", memberIds: [bob.data.user.id] },
      at,
    );
    assert.equal(group.status, 201);
    await app.call(
      "/posts",
      "POST",
      {
        title: "Shared book",
        body: "Read together",
        audienceType: "group",
        audienceId: group.data.id,
      },
      at,
    );
    const feed = await app.call("/bootstrap", "GET", undefined, bt);
    assert.equal(feed.data.posts.length, 1);
    assert.equal(feed.data.posts[0].title, "Shared book");
    assert.ok(
      feed.data.users.every(
        (u: any) => !("passwordHash" in u) && !("email" in u),
      ),
    );
    await app.call("/auth/logout", "POST", {}, at);
    assert.equal(
      (await app.call("/bootstrap", "GET", undefined, at)).status,
      401,
    );
  } finally {
    await app.stop();
  }
});
test("accounts, posts and sessions survive restarting the SQLite server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rabbit-test-"));
  let app = await start(join(dir, "rabbit.sqlite"));
  try {
    const auth = await app.call("/auth/register", "POST", account("Alice"));
    assert.equal(auth.status, 201);
    const token = auth.data.token;
    await app.call(
      "/posts",
      "POST",
      { title: "Keep this", body: "Persistent note", audienceType: "self" },
      token,
    );
    await app.stop();
    app = await start(join(dir, "rabbit.sqlite"));
    const feed = await app.call("/bootstrap", "GET", undefined, token);
    assert.equal(feed.status, 200);
    assert.equal(feed.data.posts[0].title, "Keep this");
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid account and link inputs return useful errors", async () => {
  const app = await start();
  try {
    assert.equal(
      (
        await app.call("/auth/register", "POST", {
          name: "A",
          email: "invalid",
          password: "short",
        })
      ).status,
      400,
    );
    const auth = await app.call("/auth/register", "POST", account("Alice"));
    assert.equal(auth.status, 201);
    const r = await app.call(
      "/posts",
      "POST",
      {
        audienceType: "self",
        title: "Unsafe link",
        type: "link",
        url: "javascript:alert(1)",
      },
      auth.data.token,
    );
    assert.equal(r.status, 400);
    assert.match(r.data.error, /http/i);
  } finally {
    await app.stop();
  }
});

test("a server with demo disabled starts without sample people or posts", async () => {
  const app = await start(":memory:", { demoEnabled: false });
  try {
    const auth = await app.call("/auth/register", "POST", account("Reader"));
    assert.equal(auth.status, 201);
    const feed = await app.call(
      "/bootstrap",
      "GET",
      undefined,
      auth.data.token,
    );
    assert.equal(feed.data.users.length, 1);
    assert.equal(feed.data.groups.length, 0);
    assert.equal(feed.data.posts.length, 0);
  } finally {
    await app.stop();
  }
});

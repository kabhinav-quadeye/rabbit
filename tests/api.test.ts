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
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: (await r.json()) as any };
  };
  return {
    call,
    url: `http://127.0.0.1:${address.port}/api`,
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

test("agent credentials are scoped, revocable and attribute retry-safe feedback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rabbit-agent-"));
  const dbPath = join(dir, "agent.sqlite");
  let app = await start(dbPath);
  try {
    const alice = (await app.call("/auth/register", "POST", account("Alice")))
      .data;
    const bob = (await app.call("/auth/register", "POST", account("Bob"))).data;
    const post = (
      await app.call(
        "/posts",
        "POST",
        {
          title: "Reliable garden advice",
          body: "Water at sunrise",
          audienceType: "self",
        },
        alice.token,
      )
    ).data;
    const secret = (
      await app.call(
        "/posts",
        "POST",
        {
          title: "Hidden garden",
          body: "Bob only",
          audienceType: "self",
        },
        bob.token,
      )
    ).data;
    const created = await app.call(
      "/agent-connections",
      "POST",
      { name: "Research helper" },
      alice.token,
    );
    assert.equal(created.status, 201);
    const { token, connection } = created.data;
    assert.ok(token && token !== alice.token);
    assert.equal("token" in connection, false);
    assert.equal("hash" in connection, false);
    assert.equal(
      (await app.call("/bootstrap", "GET", undefined, token)).status,
      401,
    );
    assert.equal(
      (
        await app.call(
          "/agent-connections",
          "POST",
          { name: "Escalate" },
          token,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await app.call(
          `/posts/${post.id}/comments`,
          "POST",
          { body: "attack" },
          token,
        )
      ).status,
      401,
    );
    const rpc = (name: string, args: unknown) =>
      app.call(
        "/agent/mcp",
        "POST",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
        token,
      );
    const search = await rpc("search_posts", { query: "garden" });
    assert.equal(search.status, 200);
    assert.deepEqual(
      search.data.result.structuredContent.posts.map((p: any) => p.id),
      [post.id],
    );
    assert.equal(
      (await rpc("read_post", { postId: secret.id })).data.result.isError,
      true,
    );
    assert.equal(
      (await rpc("read_post", { postId: post.id })).data.result
        .structuredContent.body,
      "Water at sunrise",
    );
    for (let i = 0; i < 2; i++) {
      const mark = await rpc("set_feedback", {
        postId: post.id,
        kind: "useful",
        active: true,
      });
      assert.equal(mark.data.result.isError, undefined);
    }
    await rpc("set_feedback", {
      postId: post.id,
      kind: "outdated",
      active: true,
    });
    await app.stop();
    app = await start(dbPath);
    const feed = (await app.call("/bootstrap", "GET", undefined, alice.token))
      .data;
    assert.deepEqual(feed.posts[0].votes, [alice.user.id]);
    assert.deepEqual(feed.posts[0].outdatedBy, [alice.user.id]);
    assert.equal(
      feed.posts[0].usefulVia[alice.user.id].name,
      "Research helper",
    );
    assert.equal(
      feed.posts[0].usefulVia[alice.user.id].connectionId,
      connection.id,
    );
    const listing = (
      await app.call("/agent-connections", "GET", undefined, alice.token)
    ).data;
    assert.equal(JSON.stringify(listing).includes(token), false);
    assert.equal(listing.connections[0].name, "Research helper");
    assert.equal(
      (
        await app.call(
          `/agent-connections/${connection.id}/revoke`,
          "POST",
          {},
          bob.token,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await app.call(
          `/agent-connections/${connection.id}/revoke`,
          "POST",
          {},
          alice.token,
        )
      ).status,
      200,
    );
    assert.equal((await rpc("search_posts", { query: "garden" })).status, 401);
    // Human actions clear the current attribution, without changing the other mark.
    const undo = (
      await app.call(`/posts/${post.id}/vote`, "POST", {}, alice.token)
    ).data;
    assert.deepEqual(undo.votes, []);
    assert.equal(undo.usefulVia[alice.user.id], undefined);
    assert.equal(undo.outdatedVia[alice.user.id].name, "Research helper");
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
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
    const friendship = await app.call(
      "/friends/requests",
      "POST",
      { recipientId: bob.data.user.id },
      at,
    );
    await app.call(
      `/friends/requests/${friendship.data.id}`,
      "PATCH",
      { status: "accepted" },
      bt,
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

test("friend discovery, consent and group permissions work through authenticated HTTP and survive restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rabbit-friends-"));
  const db = join(dir, "friends.sqlite");
  let app = await start(db);
  try {
    const alice = (await app.call("/auth/register", "POST", account("Alice")))
      .data;
    const bob = (await app.call("/auth/register", "POST", account("Bob"))).data;
    const group = (
      await app.call("/groups", "POST", { name: "Club" }, alice.token)
    ).data;
    assert.equal(
      (await app.call("/users?q=BO", "GET", undefined, alice.token)).status,
      200,
    );
    const found = await app.call(
      "/users?q=%40BO",
      "GET",
      undefined,
      alice.token,
    );
    assert.deepEqual(
      found.data.map((u: any) => u.handle),
      ["bob"],
    );
    assert.equal("email" in found.data[0], false);
    assert.equal((await app.call("/users?q=bob")).status, 401);
    const invite = () =>
      app.call(
        `/groups/${group.id}/members`,
        "POST",
        { memberIds: [bob.user.id] },
        alice.token,
      );
    assert.equal((await invite()).status, 403);
    const sent = await app.call(
      "/friends/requests",
      "POST",
      { recipientId: bob.user.id },
      alice.token,
    );
    assert.equal(sent.status, 201);
    assert.equal((await invite()).status, 403);
    assert.equal(
      (
        await app.call(
          `/friends/requests/${sent.data.id}`,
          "PATCH",
          { status: "accepted" },
          alice.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await app.call(
          `/friends/requests/${sent.data.id}`,
          "PATCH",
          { status: "accepted" },
          bob.token,
        )
      ).status,
      200,
    );
    assert.equal((await invite()).status, 200);
    await app.stop();
    app = await start(db);
    const space = (await app.call("/bootstrap", "GET", undefined, bob.token))
      .data;
    assert.deepEqual(space.friendIds, [alice.user.id]);
    assert.equal(space.groups[0].id, group.id);
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("registration normalizes unique usernames and rejects collisions before creating credentials", async () => {
  const app = await start();
  try {
    const first = await app.call("/auth/register", "POST", {
      ...account("Alice"),
      email: " Alice@Example.com ",
    });
    assert.equal(first.data.user.handle, "alice");
    assert.equal(
      (
        await app.call("/auth/register", "POST", {
          ...account("Alice"),
          email: "alice@another.com",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await app.call("/auth/register", "POST", {
          ...account("Alice"),
          email: "bad+handle@example.com",
        })
      ).status,
      400,
    );
    const retry = await app.call("/auth/register", "POST", {
      ...account("Alice"),
      email: "other@another.com",
    });
    assert.equal(retry.status, 201);
    const username = await app.call("/auth/register", "POST", {
      ...account("Reader"),
      email: "New.Reader",
    });
    assert.equal(username.status, 201);
    assert.equal(username.data.user.handle, "new.reader");
    assert.equal(
      (
        await app.call("/auth/login", "POST", {
          email: "new.reader",
          password: account("Reader").password,
        })
      ).status,
      200,
    );
  } finally {
    await app.stop();
  }
});

test("outdated marks enforce access and persist across a SQLite restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rabbit-outdated-"));
  const db = join(dir, "posts.sqlite");
  let app = await start(db);
  try {
    const alice = (await app.call("/auth/register", "POST", account("Alice")))
      .data;
    const bob = (await app.call("/auth/register", "POST", account("Bob"))).data;
    const post = (
      await app.call(
        "/posts",
        "POST",
        {
          title: "Old guide",
          body: "Check the latest version",
          audienceType: "user",
          audienceId: bob.user.id,
        },
        alice.token,
      )
    ).data;
    const path = `/posts/${post.id}/outdated`;
    assert.equal((await app.call(path, "POST", {})).status, 401);
    const mark = await app.call(
      path,
      "POST",
      { userId: alice.user.id },
      bob.token,
    );
    assert.equal(mark.status, 200);
    assert.deepEqual(mark.data.outdatedBy, [bob.user.id]);
    const privatePost = (
      await app.call(
        "/posts",
        "POST",
        {
          title: "Private",
          body: "Only Alice",
          audienceType: "self",
        },
        alice.token,
      )
    ).data;
    assert.equal(
      (
        await app.call(
          `/posts/${privatePost.id}/outdated`,
          "POST",
          {},
          bob.token,
        )
      ).status,
      403,
    );
    await app.stop();
    app = await start(db);
    const feed = (await app.call("/bootstrap", "GET", undefined, alice.token))
      .data;
    assert.deepEqual(feed.posts.find((p: any) => p.id === post.id).outdatedBy, [
      bob.user.id,
    ]);
    assert.deepEqual(
      (await app.call(path, "POST", {}, bob.token)).data.outdatedBy,
      [],
    );
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP rejects expired credentials, unsafe origins and invalid tools; bounds search and request rate", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "rabbit-agent-limits-"));
  const dbPath = join(dir, "agents.sqlite");
  const app = await start(dbPath);
  const db = new DatabaseSync(dbPath);
  try {
    const alice = (await app.call("/auth/register", "POST", account("Alice")))
      .data;
    assert.equal(
      (await app.call("/agent-connections", "POST", { name: " " }, alice.token))
        .status,
      400,
    );
    const created = (
      await app.call(
        "/agent-connections",
        "POST",
        { name: "Bounded helper" },
        alice.token,
      )
    ).data;
    const rpc = (name: string, args: unknown) =>
      app.call(
        "/agent/mcp",
        "POST",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
        created.token,
      );
    for (const [name, args] of [
      ["search_posts", { query: "" }],
      ["search_posts", { query: "a", limit: 1000 }],
      ["set_feedback", { postId: "x", kind: "saved", active: true }],
      ["set_feedback", { postId: "x", kind: "useful", active: "yes" }],
      ["delete_post", { postId: "x" }],
    ] as const) {
      const response = await rpc(name, args);
      assert.ok(response.data.result?.isError || response.data.error);
    }
    for (let i = 0; i < 3; i++)
      await app.call(
        "/posts",
        "POST",
        {
          title: `Bounded result ${i}`,
          body: "A".repeat(400),
          audienceType: "self",
        },
        alice.token,
      );
    const first = (await rpc("search_posts", { query: "Bounded", limit: 2 }))
      .data.result.structuredContent;
    assert.equal(first.posts.length, 2);
    assert.equal(first.posts[0].body.length, 300);
    assert.equal(first.nextOffset, 2);
    assert.equal("savedBy" in first.posts[0], false);
    const second = (
      await rpc("search_posts", {
        query: "Bounded",
        limit: 2,
        offset: first.nextOffset,
      })
    ).data.result.structuredContent;
    assert.equal(second.posts.length, 1);
    assert.equal(second.nextOffset, null);
    // Credentials are persisted as hashes, never as reusable secrets.
    const row = db
      .prepare("SELECT hash,data FROM agent_connections WHERE id=?")
      .get(created.connection.id) as { hash: string; data: string };
    assert.equal(row.hash.length, 64);
    assert.equal(row.data.includes(created.token), false);
    // Invalid tool calls consume the same budget as successful calls.
    assert.equal(JSON.parse(row.data).requests, 7);
    const value = JSON.parse(row.data);
    db.prepare("UPDATE agent_connections SET data=? WHERE id=?").run(
      JSON.stringify({
        ...value,
        window: Math.floor(Date.now() / 60000),
        requests: 60,
      }),
      created.connection.id,
    );
    const limited = await rpc("search_posts", { query: "Bounded" });
    assert.equal(limited.status, 429);
    assert.match(limited.data.error, /limit/i);
    db.prepare("UPDATE agent_connections SET data=? WHERE id=?").run(
      JSON.stringify({ ...value, expiresAt: "2020-01-01T00:00:00Z" }),
      created.connection.id,
    );
    assert.equal((await rpc("search_posts", { query: "Bounded" })).status, 401);
  } finally {
    db.close();
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a real MCP client can initialize, discover tools, search and read; browser origins are denied", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const app = await start();
  const client = new Client({ name: "rabbit-test-reader", version: "1.0.0" });
  try {
    const alice = (await app.call("/auth/register", "POST", account("Alice")))
      .data;
    const post = (
      await app.call(
        "/posts",
        "POST",
        {
          title: "Client guide",
          body: "Full source text",
          audienceType: "self",
        },
        alice.token,
      )
    ).data;
    const { token } = (
      await app.call(
        "/agent-connections",
        "POST",
        { name: "MCP client" },
        alice.token,
      )
    ).data;
    const originRequest = await fetch(app.url + "/agent/mcp", {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(originRequest.status, 403);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(app.url + "/agent/mcp"), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name).sort(),
      ["read_post", "search_posts", "set_feedback"],
    );
    const found = await client.callTool({
      name: "search_posts",
      arguments: { query: "guide" },
    });
    assert.equal((found.structuredContent as any).posts[0].id, post.id);
    const read = await client.callTool({
      name: "read_post",
      arguments: { postId: post.id },
    });
    assert.equal((read.structuredContent as any).body, "Full source text");
  } finally {
    await client.close();
    await app.stop();
  }
});

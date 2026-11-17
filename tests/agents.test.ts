import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "../server/api.ts";

async function start(dbPath = ":memory:") {
  const app = createApi({ dbPath, seed: true, demoEnabled: true });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const call = async (
    path: string,
    method = "GET",
    input?: unknown,
    token?: string,
  ) => {
    const r = await fetch(origin + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return {
      status: r.status,
      data: r.headers.get("Content-Type")?.includes("json")
        ? ((await r.json()) as any)
        : await r.text(),
    };
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

test("agent tokens are scoped, revocable and persistent; drafts require human approval", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rabbit-agents-"));
  let app = await start(join(dir, "test.sqlite"));
  try {
    const session = (await app.call("/api/auth/demo", "POST", {})).data.token;
    const created = await app.call(
      "/api/agents/tokens",
      "POST",
      { name: "Research assistant" },
      session,
    );
    assert.equal(created.status, 201);
    const { token, connection } = created.data;
    assert.match(token, /^rba_/);
    const list = await app.call("/api/agents", "GET", undefined, session);
    assert.equal(list.data.connections[0].name, "Research assistant");
    assert.equal(JSON.stringify(list.data).includes(token), false);
    assert.equal(
      (await app.call("/api/bootstrap", "GET", undefined, token)).status,
      401,
    );
    assert.equal(
      (await app.call("/api/agents", "GET", undefined, token)).status,
      401,
    );
    assert.equal(
      (await app.call("/api/agent/search?q=", "GET", undefined, session))
        .status,
      401,
    );
    const privatePost = (
      await app.call(
        "/api/posts",
        "POST",
        { title: "Secret research", body: "Only Alex", audienceType: "self" },
        session,
      )
    ).data;
    const results = await app.call(
      "/api/agent/search?q=Secret",
      "GET",
      undefined,
      token,
    );
    assert.equal(results.status, 200);
    assert.equal(results.data[0].id, privatePost.id);
    assert.equal(
      (
        await app.call(
          `/api/agent/posts/${privatePost.id}`,
          "GET",
          undefined,
          token,
        )
      ).status,
      200,
    );
    for (let i = 0; i < 2; i++) {
      const r = await app.call(
        `/api/agent/posts/${privatePost.id}/feedback`,
        "PUT",
        { kind: "useful", active: true },
        token,
      );
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.votes, ["alex"]);
    }
    const draft = await app.call(
      "/api/agent/drafts",
      "POST",
      {
        title: "Proposed finding",
        body: "Review this first",
        audienceType: "group",
        audienceId: "design",
      },
      token,
    );
    assert.equal(draft.status, 201);
    assert.equal(
      (
        await app.call("/api/bootstrap", "GET", undefined, session)
      ).data.posts.some((p: any) => p.title === "Proposed finding"),
      false,
    );
    assert.equal(
      (
        await app.call(
          `/api/agent/drafts/${draft.data.id}/publish`,
          "POST",
          {},
          token,
        )
      ).status,
      403,
    );
    assert.equal(
      (await app.call("/api/agent/goals", "POST", { title: "No grant" }, token))
        .status,
      403,
    );
    const overview = (await app.call("/api/agents", "GET", undefined, session))
      .data;
    assert.equal(
      overview.activity.filter((a: any) => a.action === "read").length,
      1,
    );
    assert.equal(
      overview.activity.filter((a: any) => a.action === "feedback").length,
      2,
    );
    assert.equal(overview.drafts.length, 1);
    const publish = await app.call(
      `/api/agents/drafts/${draft.data.id}/publish`,
      "POST",
      { title: "Reviewed finding", body: "Edited by me" },
      session,
    );
    assert.equal(publish.status, 200);
    assert.equal(publish.data.audienceType, "self");
    assert.equal(publish.data.title, "Reviewed finding");
    assert.equal(
      (
        await app.call(
          `/api/agents/drafts/${draft.data.id}/publish`,
          "POST",
          {},
          session,
        )
      ).data.id,
      publish.data.id,
    );
    await app.stop();
    app = await start(join(dir, "test.sqlite"));
    assert.equal(
      (await app.call("/api/agent/search", "GET", undefined, token)).status,
      200,
    );
    assert.equal(
      (
        await app.call(
          `/api/agents/tokens/${connection.id}`,
          "DELETE",
          undefined,
          session,
        )
      ).status,
      200,
    );
    assert.equal(
      (await app.call("/api/agent/search", "GET", undefined, token)).status,
      401,
    );
    const guide = await app.call("/AGENTS.md");
    assert.equal(guide.status, 200);
    assert.match(guide.data, /\/docs/);
    assert.doesNotMatch(guide.data, /token is not sensitive/i);
  } finally {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("agents cannot discover private posts or manage another account connections or drafts", async () => {
  const app = await start();
  try {
    const alex = (await app.call("/api/auth/demo", "POST", {})).data.token;
    const eve = (
      await app.call("/api/auth/register", "POST", {
        name: "Eve",
        email: "eve@example.com",
        password: "test-password-123",
      })
    ).data.token;
    const post = (
      await app.call(
        "/api/posts",
        "POST",
        { title: "Alex secret", body: "hidden", audienceType: "self" },
        alex,
      )
    ).data;
    const own = (
      await app.call("/api/agents/tokens", "POST", { name: "Alex agent" }, alex)
    ).data;
    const other = (
      await app.call("/api/agents/tokens", "POST", { name: "Eve agent" }, eve)
    ).data;
    assert.equal(
      (
        await app.call(
          "/api/agent/search?q=secret",
          "GET",
          undefined,
          other.token,
        )
      ).data.length,
      0,
    );
    assert.equal(
      (
        await app.call(
          `/api/agent/posts/${post.id}`,
          "GET",
          undefined,
          other.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await app.call(
          `/api/agent/posts/${post.id}/feedback`,
          "PUT",
          { kind: "outdated", active: true },
          other.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await app.call(
          `/api/agents/tokens/${own.connection.id}`,
          "DELETE",
          undefined,
          eve,
        )
      ).status,
      404,
    );
    const draft = (
      await app.call(
        "/api/agent/drafts",
        "POST",
        { title: "Mine", body: "Private" },
        own.token,
      )
    ).data;
    assert.equal(
      (
        await app.call(
          `/api/agents/drafts/${draft.id}/publish`,
          "POST",
          {},
          eve,
        )
      ).status,
      404,
    );
    assert.deepEqual(
      (await app.call("/api/agents", "GET", undefined, eve)).data.drafts,
      [],
    );
  } finally {
    await app.stop();
  }
});

test("revocation wins over an agent write with an unfinished request body", async () => {
  const { request: httpRequest } = await import("node:http");
  const app = createApi({ dbPath: ":memory:", seed: true, demoEnabled: true });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const json = async (
    path: string,
    method: string,
    body: unknown,
    token?: string,
  ) => {
    const r = await fetch(origin + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return r.json() as any;
  };
  try {
    const session = (await json("/api/auth/demo", "POST", {})).token;
    const { token, connection } = await json(
      "/api/agents/tokens",
      "POST",
      { name: "Slow agent" },
      session,
    );
    const received = once(app.server, "request");
    const pending = httpRequest(origin + "/api/agent/drafts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const response = new Promise<number>((resolve) =>
      pending.on("response", (r) => {
        r.resume();
        resolve(r.statusCode!);
      }),
    );
    pending.write('{"title":"After revocation",');
    await received;
    await fetch(origin + `/api/agents/tokens/${connection.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session}` },
    });
    pending.end('"body":"Should never be saved"}');
    assert.equal(await response, 401);
    const overview = (await fetch(origin + "/api/agents", {
      headers: { Authorization: `Bearer ${session}` },
    }).then((r) => r.json())) as any;
    assert.equal(overview.connections.length, 0);
    assert.equal(overview.drafts.length, 0);
  } finally {
    app.server.close();
    await once(app.server, "close");
    app.close();
  }
});

test("a human profile update cannot reset the agent request budget", async () => {
  const app = await start();
  try {
    const session = (await app.call("/api/auth/demo", "POST", {})).data.token;
    const { token } = (
      await app.call(
        "/api/agents/tokens",
        "POST",
        { name: "Research" },
        session,
      )
    ).data;
    for (let i = 0; i < 60; i++)
      assert.equal(
        (await app.call("/api/agent/unsupported", "POST", {}, token)).status,
        403,
      );
    assert.equal(
      (await app.call("/api/profile", "PATCH", { name: "Alex" }, session))
        .status,
      200,
    );
    assert.equal(
      (await app.call("/api/agent/search", "GET", undefined, token)).status,
      429,
    );
  } finally {
    await app.stop();
  }
});

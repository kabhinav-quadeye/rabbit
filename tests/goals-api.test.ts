import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "../server/api.ts";

async function start(dbPath = ":memory:") {
  const app = createApi({ dbPath, seed: false, demoEnabled: false });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const { port } = app.server.address() as { port: number };
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: (await r.json()) as any };
  };
  const register = async (name: string) =>
    (
      await call("/auth/register", "POST", {
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: "test-password-123",
      })
    ).data.token as string;
  return {
    call,
    register,
    stop: async () => {
      app.server.close();
      await once(app.server, "close");
      app.close();
    },
  };
}

test("goal and task routes work through HTTP and stay private", async () => {
  const app = await start();
  try {
    const at = await app.register("Alice");
    const et = await app.register("Eve");
    assert.equal((await app.call("/goals")).status, 401);
    assert.deepEqual((await app.call("/goals", "GET", undefined, at)).data, {
      goals: [],
      tasks: [],
    });
    const goal = await app.call(
      "/goals",
      "POST",
      { title: "Run a half marathon", icon: "run" },
      at,
    );
    assert.equal(goal.status, 201);
    const g = goal.data;
    const created = await app.call(
      `/goals/${g.id}/tasks`,
      "POST",
      { description: "Gear" },
      at,
    );
    assert.equal(created.status, 201);
    const parent = created.data[0];
    const child = (
      await app.call(
        `/goals/${g.id}/tasks`,
        "POST",
        { description: "Shoes", parentId: parent.id },
        at,
      )
    ).data[0];
    assert.equal(child.depth, 1);

    const patched = await app.call(
      `/tasks/${child.id}`,
      "PATCH",
      { priority: "high", notes: "Size 9" },
      at,
    );
    assert.equal(patched.data.priority, "high");

    const blocked = await app.call(
      `/tasks/${parent.id}/complete`,
      "POST",
      { cascade: false },
      at,
    );
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, /1 open sub-task/);
    const done = await app.call(
      `/tasks/${parent.id}/complete`,
      "POST",
      { cascade: true },
      at,
    );
    assert.equal(done.data.length, 2);
    const reopened = await app.call(
      `/tasks/${child.id}/reopen`,
      "POST",
      {},
      at,
    );
    assert.equal(reopened.data.length, 2);

    assert.equal(
      (await app.call(`/goals/${g.id}`, "PATCH", { title: "Mine" }, et)).status,
      404,
    );
    assert.equal(
      (await app.call(`/tasks/${child.id}`, "PATCH", { notes: "x" }, et))
        .status,
      404,
    );
    assert.equal(
      (await app.call(`/tasks/${child.id}`, "DELETE", undefined, et)).status,
      404,
    );
    assert.deepEqual((await app.call("/goals", "GET", undefined, et)).data, {
      goals: [],
      tasks: [],
    });

    const renamed = await app.call(
      `/goals/${g.id}`,
      "PATCH",
      { title: "Run 21 km" },
      at,
    );
    assert.equal(renamed.data.title, "Run 21 km");
    const deleted = await app.call(
      `/tasks/${parent.id}`,
      "DELETE",
      undefined,
      at,
    );
    assert.equal(deleted.data.ids.length, 2);
    const removed = await app.call(`/goals/${g.id}`, "DELETE", undefined, at);
    assert.equal(removed.status, 200);
    assert.deepEqual(
      (await app.call("/goals", "GET", undefined, at)).data.goals,
      [],
    );
  } finally {
    await app.stop();
  }
});

test("goals persist across an SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "rabbit-goals-"));
  const dbPath = join(directory, "goals.sqlite");
  try {
    let app = await start(dbPath);
    const token = await app.register("Alice");
    const g = (
      await app.call("/goals", "POST", { title: "Learn Spanish" }, token)
    ).data;
    await app.call(
      `/goals/${g.id}/tasks`,
      "POST",
      { description: "Find a tutor" },
      token,
    );
    await app.stop();
    app = await start(dbPath);
    const login = await app.call("/auth/login", "POST", {
      email: "alice@example.com",
      password: "test-password-123",
    });
    const overview = (
      await app.call("/goals", "GET", undefined, login.data.token)
    ).data;
    assert.deepEqual(
      overview.goals.map((x: any) => x.title),
      ["Learn Spanish"],
    );
    assert.deepEqual(
      overview.tasks.map((x: any) => x.description),
      ["Find a tutor"],
    );
    await app.stop();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

test("goal sharing routes let friends collaborate and leave", async () => {
  const app = await start();
  try {
    const at = await app.register("Alice");
    const bt = await app.register("Bob");
    const et = await app.register("Eve");
    const me = async (token: string) =>
      (await app.call("/bootstrap", "GET", undefined, token)).data.currentUser
        .id as string;
    const [a, b, e] = [await me(at), await me(bt), await me(et)];
    const request = (
      await app.call("/friends/requests", "POST", { recipientId: b }, at)
    ).data;
    await app.call(
      `/friends/requests/${request.id}`,
      "PATCH",
      { status: "accepted" },
      bt,
    );
    const g = (await app.call("/goals", "POST", { title: "Trip" }, at)).data;
    await app.call(`/goals/${g.id}/tasks`, "POST", { description: "Old" }, at);
    assert.equal(
      (await app.call(`/goals/${g.id}/members`, "POST", { memberIds: [e] }, at))
        .status,
      403,
    );
    const shared = await app.call(
      `/goals/${g.id}/members`,
      "POST",
      { memberIds: [b] },
      at,
    );
    assert.equal(shared.status, 200);
    assert.deepEqual(shared.data.memberIds, [a, b]);
    const view = (await app.call("/goals", "GET", undefined, bt)).data;
    assert.deepEqual(
      view.tasks.map((t: any) => t.description),
      ["Old"],
    );
    const added = await app.call(
      `/goals/${g.id}/tasks`,
      "POST",
      { description: "New from Bob" },
      bt,
    );
    assert.equal(added.status, 201);
    assert.equal(
      (await app.call(`/goals/${g.id}`, "PATCH", { title: "Mine" }, bt)).status,
      403,
    );
    assert.equal(
      (await app.call("/goals", "GET", undefined, et)).data.goals.length,
      0,
    );
    const left = await app.call(
      `/goals/${g.id}/members/${b}`,
      "DELETE",
      undefined,
      bt,
    );
    assert.deepEqual(left.data.memberIds, [a]);
    assert.equal(
      (await app.call("/goals", "GET", undefined, bt)).data.goals.length,
      0,
    );
  } finally {
    await app.stop();
  }
});

test("a WebFetch key can read and suggest a task for just one goal", async () => {
  const app = await start();
  try {
    const alice = await app.register("Alice");
    const eve = await app.register("Eve");
    const makeGoal = async (title: string, user = alice) =>
      (await app.call("/goals", "POST", { title }, user)).data.id as string;
    const goal = await makeGoal("Learn Bengali");
    const other = await makeGoal("Another private goal");
    const foreign = await makeGoal("Eve's goal", eve);
    const mint = (goalId: string) =>
      app.call("/agent/goals", "POST", { goalId }, alice);
    assert.equal((await mint(foreign)).status, 404);
    const key = await mint(goal);
    assert.equal(key.status, 201);
    assert.match(key.data.token, /^rg_[0-9a-f]{64}$/);
    const remaining = Date.parse(key.data.expiresAt) - Date.now();
    assert.ok(remaining > 14 * 60 * 1000 && remaining <= 15 * 60 * 1000);
    assert.equal((await app.call("/agent/goals")).status, 401);
    assert.equal(
      (await app.call("/agent/goals", "POST", { goalId: goal }, key.data.token))
        .status,
      401,
    );
    const params = new URLSearchParams({ goalId: goal, token: key.data.token });
    const read = () => app.call(`/agent/goals?${params}`);
    assert.deepEqual((await read()).data.goal, {
      id: goal,
      title: "Learn Bengali",
      why: "",
      status: "active",
    });
    const wrong = new URLSearchParams(params);
    wrong.set("goalId", other);
    assert.equal((await app.call(`/agent/goals?${wrong}`)).status, 401);
    assert.equal(
      (await app.call("/mcp", "POST", {}, key.data.token)).status,
      401,
    );
    const suggest = (description: string, method = "GET") =>
      app.call(
        `/agent/goal-suggestions?${params}&description=${encodeURIComponent(description)}`,
        method,
      );
    assert.equal((await suggest("   ")).status, 400);
    assert.equal((await suggest("Find a tutor", "POST")).status, 405);
    const draft = await suggest("Find a tutor");
    assert.equal(draft.status, 200);
    const review = new URL(draft.data.reviewPath, "https://rabbit.example");
    assert.equal(review.origin, "https://rabbit.example");
    assert.equal(review.pathname, "/");
    assert.equal(review.search, "");
    assert.ok(!review.href.includes(key.data.token));
    assert.deepEqual(
      Object.fromEntries(new URLSearchParams(review.hash.slice(1))),
      { rabbitGoal: goal, suggestedTask: "Find a tutor" },
    );
    assert.deepEqual((await read()).data.tasks, []);
    for (let n = 0; n < 11; n++) {
      assert.equal(
        (
          await app.call(
            `/goals/${goal}/tasks`,
            "POST",
            { description: `Task ${n}`, notes: "Private notes" },
            alice,
          )
        ).status,
        201,
      );
    }
    const first = (await read()).data;
    assert.equal(first.tasks.length, 10);
    assert.equal(first.nextOffset, 10);
    assert.ok(first.tasks.every((task: object) => !("notes" in task)));
    params.set("offset", "10");
    const last = (await read()).data;
    assert.equal(last.tasks.length, 1);
    assert.equal(last.nextOffset, null);
    assert.ok(
      first.tasks.every((task: { id: string }) => task.id !== last.tasks[0].id),
    );

    const replacement = await mint(other);
    assert.equal(replacement.status, 201);
    assert.equal((await read()).status, 401);
    params.set("token", replacement.data.token);
    params.set("goalId", other);
    assert.equal((await read()).status, 200);
    assert.equal(
      (await app.call("/agent/goals", "DELETE", undefined, alice)).status,
      200,
    );
    assert.equal((await read()).status, 401);
  } finally {
    await app.stop();
  }
});

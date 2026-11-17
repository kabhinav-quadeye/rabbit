import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAgents, agentOwner } from "../server/agents.ts";
import type { AgentOverview } from "../src/agent-types.ts";
import type { Post } from "../src/types.ts";
import { seedState } from "../server/seed.ts";

test("agent audit coalesces daily reads, prunes 30-day history and expires credentials", () => {
  const state = seedState();
  const day = new Date("2026-11-01T12:00:00Z");
  const { token } = handleAgents(
    state,
    "alex",
    "/api/agents/tokens",
    "POST",
    { name: "Research" },
    undefined,
    day,
  ) as { token: string };
  for (const date of [
    "2026-11-01T13:00:00Z",
    "2026-11-01T14:00:00Z",
    "2026-11-02T00:00:00Z",
  ])
    handleAgents(
      state,
      "alex",
      "/api/agent/search",
      "GET",
      {},
      token,
      new Date(date),
    );
  assert.equal(state.agentAccounts![0].activity.length, 2);
  const later = new Date("2026-12-01T15:00:00Z");
  assert.throws(() => agentOwner(state, token, later), /expired/);
  const overview = handleAgents(
    state,
    "alex",
    "/api/agents",
    "GET",
    {},
    undefined,
    later,
  ) as AgentOverview;
  assert.equal(overview.activity.length, 1);
  assert.equal(overview.connections.length, 0);
});

test("agent request limits include unsupported calls and reset after a minute", () => {
  const state = seedState(),
    day = new Date("2026-11-01T12:00:00Z");
  const { token } = handleAgents(
    state,
    "alex",
    "/api/agents/tokens",
    "POST",
    { name: "Research" },
    undefined,
    day,
  ) as { token: string };
  for (let i = 0; i < 60; i++)
    assert.throws(
      () =>
        handleAgents(
          state,
          "alex",
          "/api/agent/not-allowed",
          "POST",
          {},
          token,
          day,
        ),
      /not allowed/,
    );
  assert.throws(
    () =>
      handleAgents(state, "alex", "/api/agent/search", "GET", {}, token, day),
    (e) => (e as any).status === 429,
  );
  assert.doesNotThrow(() =>
    handleAgents(
      state,
      "alex",
      "/api/agent/search",
      "GET",
      {},
      token,
      new Date(day.getTime() + 60000),
    ),
  );
});

test("agent loses circle access immediately when membership is removed", () => {
  const state = seedState(),
    day = new Date();
  const { token } = handleAgents(state, "alex", "/api/agents/tokens", "POST", {
    name: "Research",
  }) as { token: string };
  const group = state.groups.find((g) => g.memberIds.includes("alex"))!;
  const p = state.posts.find(
    (p) =>
      p.audienceType === "group" &&
      p.audienceId === group.id &&
      p.authorId !== "alex",
  )!;
  assert.ok(p);
  assert.equal(
    (
      handleAgents(
        state,
        "alex",
        `/api/agent/posts/${p.id}`,
        "GET",
        {},
        token,
      ) as Post
    ).id,
    p.id,
  );
  group.memberIds = group.memberIds.filter((id) => id !== "alex");
  assert.throws(
    () =>
      handleAgents(
        state,
        "alex",
        `/api/agent/posts/${p.id}/feedback`,
        "PUT",
        { kind: "useful", active: true },
        token,
      ),
    /access/,
  );
});

test("draft storage rejects a proposal that would exceed the account byte budget", () => {
  const state = seedState();
  const { token } = handleAgents(state, "alex", "/api/agents/tokens", "POST", {
    name: "Research",
  }) as { token: string };
  for (let i = 0; i < 6; i++)
    handleAgents(
      state,
      "alex",
      "/api/agent/drafts",
      "POST",
      { title: "Research", body: "界".repeat(20000) },
      token,
    );
  assert.throws(
    () =>
      handleAgents(
        state,
        "alex",
        "/api/agent/drafts",
        "POST",
        { title: "Too much", body: "界".repeat(20000) },
        token,
      ),
    /draft storage/i,
  );
});

test("daily read summary is not repeated after the recent history rolls over", () => {
  const state = seedState(),
    date = new Date("2026-11-01T10:00:00Z");
  const { token } = handleAgents(
    state,
    "alex",
    "/api/agents/tokens",
    "POST",
    { name: "Research" },
    undefined,
    date,
  ) as { token: string };
  const post = state.posts[0];
  handleAgents(state, "alex", "/api/agent/search", "GET", {}, token, date);
  for (let i = 0; i < 201; i++)
    handleAgents(
      state,
      "alex",
      `/api/agent/posts/${post.id}/feedback`,
      "PUT",
      { kind: "useful", active: true },
      token,
      new Date(date.getTime() + i * 61000),
    );
  handleAgents(
    state,
    "alex",
    "/api/agent/search",
    "GET",
    {},
    token,
    new Date(date.getTime() + 202 * 61000),
  );
  assert.equal(
    state.agentAccounts![0].activity.filter((e) => e.action === "read").length,
    0,
  );
});

test("agent pagination rejects fractional and negative offsets instead of repeating a page", () => {
  const state = seedState();
  const { token } = handleAgents(state, "alex", "/api/agents/tokens", "POST", {
    name: "Research",
  }) as { token: string };
  for (const offset of ["-1", "1.5", "not-a-number"])
    assert.throws(
      () =>
        handleAgents(
          state,
          "alex",
          "/api/agent/search",
          "GET",
          { offset },
          token,
        ),
      /offset/i,
    );
});

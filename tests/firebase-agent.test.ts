import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  setDoc,
  deleteDoc,
  setLogLevel,
} from "firebase/firestore";
import {
  initializeApp as adminApp,
  deleteApp as deleteAdmin,
} from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { createApi } from "../server/api.ts";
import { createFirebaseService } from "../src/firebase-service.ts";

test(
  "Firebase agent keys use the signed-in account and rules prevent direct publication",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    setLogLevel("silent");
    const projectId = "demo-rabbit-friends";
    const config = { projectId, apiKey: "fake-key" };
    const admin = adminApp({ projectId }, "agent-test");
    const mint = (uid: string) =>
      adminAuth(admin).createCustomToken(uid, { rabbitAgent: true });
    const apps = ["owner", "agent"].map((label) =>
      initializeApp(config, label),
    );
    const auths = apps.map((app) => {
      const auth = getAuth(app);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      return auth;
    });
    const dbs = apps.map((app) => {
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", 8085);
      return db;
    });
    const owner = createFirebaseService(auths[0], dbs[0]).request;
    const app = createApi({
      dbPath: ":memory:",
      seed: false,
      demoEnabled: false,
      firebaseAgentConfig: config,
    });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const port = (app.server.address() as { port: number }).port;
    const call = (path: string, bearer: string, data: object) =>
      fetch(`http://127.0.0.1:${port}/api${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(data),
      });
    try {
      const { token } = await owner<{ token: string }>(
        "/auth/register",
        "POST",
        {
          name: "Firebase agent owner",
          email: `agent-${Date.now()}`,
          password: "test-password",
        },
      );
      const uid = auths[0].currentUser!.uid;
      const goal = await owner<Record<string, any>>("/goals", "POST", {
        title: "Existing goal",
      });
      const connection = await call("/agent/connection", token, {});
      assert.equal(connection.status, 201);
      const key = (await connection.json()).token;
      const tool = (name: string, args: object) =>
        call("/mcp", key, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }).then((r) => r.json());
      assert.equal(
        (await tool("list_goals", {})).result.structuredContent.goals[0].id,
        goal.id,
      );
      const existingPost = await owner<Record<string, any>>("/posts", "POST", {
        title: "Existing post",
        body: "Available to the owner",
        audienceType: "self",
      });
      assert.equal(
        (await tool("search_posts", { query: "Existing" })).result
          .structuredContent.posts.length,
        1,
      );
      const proposal = (
        await tool("create_post_draft", { title: "Review first" })
      ).result.structuredContent.proposal;
      const agent = await signInWithCustomToken(auths[1], await mint(uid));
      assert.equal(
        (await call("/agent/connection", await agent.user.getIdToken(), {}))
          .status,
        401,
      );
      await assert.rejects(
        setDoc(doc(dbs[1], "goals", "bypass"), { ...goal, id: "bypass" }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(dbs[1], "posts", "bypass"), {
          ...JSON.parse(JSON.stringify(existingPost)),
          id: "bypass",
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(dbs[1], "agentProposals", "foreign"), {
          ...proposal,
          id: "foreign",
          ownerId: "other-user",
        }),
        /permission/i,
      );
      await assert.rejects(deleteDoc(doc(dbs[1], "users", uid)), /permission/i);
      await assert.rejects(
        deleteDoc(doc(dbs[1], "agentProposals", proposal.id)),
        /permission/i,
      );
      assert.deepEqual(await owner("/search?q=Review"), []);
      const approvals = await Promise.allSettled([
        owner(`/agent/proposals/${proposal.id}`, "POST"),
        owner(`/agent/proposals/${proposal.id}`, "POST"),
      ]);
      assert.equal(
        approvals.filter((item) => item.status === "fulfilled").length,
        1,
      );
      assert.equal((await owner<any[]>("/search?q=Review")).length, 1);
      const suggested = (
        await tool("suggest_goal", {
          title: "Read more",
          why: "Make time for books",
        })
      ).result.structuredContent.proposal;
      const approved = await owner<{ memberIds: string[] }>(
        `/agent/proposals/${suggested.id}`,
        "POST",
      );
      assert.deepEqual(approved.memberIds, [uid]);
    } finally {
      app.server.close();
      await once(app.server, "close");
      await app.close();
      await Promise.all(apps.map(deleteApp));
      await deleteAdmin(admin);
    }
  },
);

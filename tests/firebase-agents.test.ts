import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp, deleteApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  setLogLevel,
} from "firebase/firestore";
import { getApps, deleteApp as deleteAdminApp } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { createFirebaseService } from "../src/firebase-service.ts";
import { createApi } from "../server/api.ts";
import type { Post, Bootstrap } from "../src/types.ts";

test(
  "Firebase agent access, transactions and attribution resist direct writes",
  {
    skip: !process.env.FIRESTORE_EMULATOR_HOST,
    timeout: 90000,
  },
  async () => {
    setLogLevel("silent");
    const apps = [0, 1].map((i) =>
      initializeApp(
        { apiKey: "fake-key", projectId: "demo-rabbit-friends" },
        `agent-${i}-${Date.now()}`,
      ),
    );
    const auths = apps.map((app) => {
      const auth = initializeAuth(app, { persistence: inMemoryPersistence });
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      return auth;
    });
    const databases = apps.map((app) => {
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", 8085);
      return db;
    });
    const services = auths.map((auth, i) =>
      createFirebaseService(auth, databases[i]),
    );
    const app = createApi({
      dbPath: ":memory:",
      seed: false,
      demoEnabled: false,
      firebaseProjectId: "demo-rabbit-friends",
    });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api`;
    const call = async (path: string, token: string, data?: unknown) => {
      const res = await fetch(base + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: res.status, data: (await res.json()) as any };
    };
    try {
      for (const [i, service] of services.entries())
        await service.request("/auth/register", "POST", {
          name: `Agent reader ${i}`,
          email: `agent-reader-${i}-${Date.now()}`,
          password: "rabbit-test-password",
        });
      const [a, b] = auths.map((auth) => auth.currentUser!.uid);
      const [at, bt] = await Promise.all(
        auths.map((auth) => auth.currentUser!.getIdToken()),
      );
      const post = await services[0].request<Post>("/posts", "POST", {
        audienceType: "user",
        audienceId: b,
        title: "Shared guide",
        body: "Useful advice",
      });
      const secret = await services[1].request<Post>("/posts", "POST", {
        audienceType: "self",
        title: "Hidden guide",
        body: "Bob only",
      });
      const created = await call("/agent-connections", at, {
        name: "Firebase helper",
      });
      assert.equal(created.status, 201);
      const { token, connection } = created.data;
      const rpc = (name: string, args: unknown) =>
        call("/agent/mcp", token, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        });
      assert.deepEqual(
        (
          await rpc("search_posts", { query: "guide" })
        ).data.result.structuredContent.posts.map((p: any) => p.id),
        [post.id],
      );
      assert.equal(
        (await rpc("read_post", { postId: secret.id })).data.result.isError,
        true,
      );
      await Promise.all([
        rpc("set_feedback", { postId: post.id, kind: "useful", active: true }),
        services[1].request(`/posts/${post.id}/vote`, "POST"),
      ]);
      let latest = (await getDoc(doc(databases[0], "posts", post.id))).data()!;
      assert.deepEqual(new Set(latest.votes), new Set([a, b]));
      assert.equal(latest.usefulVia[a].name, "Firebase helper");
      // Client SDK writes cannot forge, edit, or remove another reader's attribution.
      const forged = {
        connectionId: "fake",
        name: "Fake agent",
        at: new Date().toISOString(),
      };
      await assert.rejects(
        updateDoc(doc(databases[1], "posts", post.id), { usefulVia: {} }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[0], "posts", post.id), {
          usefulVia: { [a]: forged },
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(databases[0], "posts", "forged-agent-post"), {
          ...JSON.parse(JSON.stringify(post)),
          id: "forged-agent-post",
          usefulVia: { [a]: forged },
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(databases[0], "agentCredentials", "fake"), { ownerId: a }),
        /permission/i,
      );
      const admin = adminFirestore(
        getApps().find((app) => app.name.startsWith("rabbit-agents-"))!,
      );
      const credentials = await admin
        .collection("agentCredentials")
        .where("ownerId", "==", a)
        .get();
      const credential = credentials.docs[0];
      assert.equal(JSON.stringify(credential.data()).includes(token), false);
      await assert.rejects(
        getDoc(doc(databases[0], "agentCredentials", credential.id)),
        /permission/i,
      );
      // Even the owner cannot erase provenance while retaining an agent mark.
      await assert.rejects(
        updateDoc(doc(databases[0], "posts", post.id), { usefulVia: {} }),
        /permission/i,
      );
      await services[0].request(`/posts/${post.id}/vote`, "POST");
      latest = (await getDoc(doc(databases[0], "posts", post.id))).data()!;
      assert.deepEqual(latest.votes, [b]);
      assert.equal(latest.usefulVia[a], undefined);
      await rpc("set_feedback", {
        postId: post.id,
        kind: "outdated",
        active: true,
      });
      assert.equal(
        (await call(`/agent-connections/${connection.id}/revoke`, bt, {}))
          .status,
        404,
      );
      await call(`/agent-connections/${connection.id}/revoke`, at, {});
      assert.equal((await rpc("read_post", { postId: post.id })).status, 401);
      const expired = await call("/agent-connections", at, { name: "Expired" });
      const all = await admin
        .collection("agentCredentials")
        .where("id", "==", expired.data.connection.id)
        .get();
      await all.docs[0].ref.update({ expiresAt: "2020-01-01T00:00:00Z" });
      assert.equal(
        (await call("/agent/mcp", expired.data.token, {})).status,
        401,
      );
      assert.equal(
        (await services[0].request<Bootstrap>("/bootstrap")).posts[0]
          .outdatedVia?.[a].name,
        "Firebase helper",
      );
      const current = await call("/agent-connections", at, {
        name: "Membership checks",
      });
      const circle = await services[1].request<{ id: string }>(
        "/groups",
        "POST",
        { name: "Temporary circle" },
      );
      await admin
        .collection("groups")
        .doc(circle.id)
        .update({ memberIds: [a, b] });
      const shared = await services[1].request<Post>("/posts", "POST", {
        audienceType: "group",
        audienceId: circle.id,
        title: "Circle-only guide",
        body: "Current members only",
      });
      const readCircle = () =>
        call("/agent/mcp", current.data.token, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "read_post", arguments: { postId: shared.id } },
        });
      assert.equal(
        (await readCircle()).data.result.structuredContent.body,
        "Current members only",
      );
      await admin
        .collection("groups")
        .doc(circle.id)
        .update({ memberIds: [b] });
      assert.equal((await readCircle()).data.result.isError, true);
      const active = await call("/agent-connections", at, {
        name: "Account lifecycle",
      });
      const adminApp = getApps().find((app) =>
        app.name.startsWith("rabbit-agents-"),
      )!;
      await adminAuth(adminApp).updateUser(a, { disabled: true });
      assert.equal(
        (
          await call("/agent/mcp", active.data.token, {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
          })
        ).status,
        401,
      );
    } finally {
      app.server.close();
      await once(app.server, "close");
      app.close();
      await Promise.all(apps.map(deleteApp));
      await Promise.all(
        getApps()
          .filter((a) => a.name.startsWith("rabbit-agents-"))
          .map(deleteAdminApp),
      );
    }
  },
);

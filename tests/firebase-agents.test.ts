import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  setDoc,
  getDoc,
  doc,
  updateDoc,
  setLogLevel,
} from "firebase/firestore";
import { createFirebaseService } from "../src/firebase-service.ts";
import { createApi } from "../server/api.ts";
import { once } from "node:events";

test(
  "Firebase agent gateway enforces current access, audit ownership and direct-write denial",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 90000 },
  async () => {
    setLogLevel("silent");
    const apps = [0, 1].map((i) =>
      initializeApp(
        { apiKey: "fake", projectId: "demo-rabbit-friends" },
        `agents-${i}-${Date.now()}`,
      ),
    );
    const auths = apps.map((app) => {
      const a = initializeAuth(app, { persistence: inMemoryPersistence });
      connectAuthEmulator(a, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      return a;
    });
    const dbs = apps.map((app) => {
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", 8085);
      return db;
    });
    const app = createApi({
      dbPath: ":memory:",
      seed: false,
      demoEnabled: false,
      firebaseAgents: true,
    });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const call = async (
      path: string,
      token: string,
      method = "GET",
      body?: unknown,
    ) => {
      const r = await fetch(origin + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, data: (await r.json()) as any };
    };
    try {
      const services = auths.map((a, i) => createFirebaseService(a, dbs[i]));
      for (const [i, s] of services.entries())
        await s.request("/auth/register", "POST", {
          name: `Agent reader ${i}`,
          email: `agent${i}-${Date.now()}`,
          password: "test-password-123",
        });
      const [alice, eve] = await Promise.all(
        auths.map((a) => a.currentUser!.getIdToken()),
      );
      const uid = auths[0].currentUser!.uid;
      const connection = await call("/api/agents/tokens", alice, "POST", {
        name: "Research",
      });
      assert.equal(connection.status, 201);
      const token = connection.data.token;
      const privatePost = await services[1].request<any>("/posts", "POST", {
        title: "Private evidence",
        body: "Secret",
        audienceType: "self",
      });
      assert.equal(
        (await call(`/api/agent/posts/${privatePost.id}`, token)).status,
        403,
      );
      assert.deepEqual(
        (await call("/api/agent/search?q=Private", token)).data,
        [],
      );
      const friendship = await services[0].request<any>(
        "/friends/requests",
        "POST",
        { recipientId: auths[1].currentUser!.uid },
      );
      await services[1].request(`/friends/requests/${friendship.id}`, "PATCH", {
        status: "accepted",
      });
      const circle = await services[1].request<any>("/groups", "POST", {
        name: "Research",
        memberIds: [uid],
      });
      const post = await services[1].request<any>("/posts", "POST", {
        title: "Circle evidence",
        body: "Shared",
        audienceType: "group",
        audienceId: circle.id,
      });
      assert.equal(
        (await call(`/api/agent/posts/${post.id}`, token)).status,
        200,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await call(`/api/agent/posts/${post.id}/feedback`, token, "PUT", {
              kind: "useful",
              active: true,
            })
          ).status,
          200,
        );
      assert.deepEqual(
        (await getDoc(doc(dbs[1], "posts", post.id))).data()!.votes,
        [uid],
      );
      // Privileged emulator request simulates a circle membership removal.
      const { getFirestore: adminDb } =
        await import("firebase-admin/firestore");
      const { getApps } = await import("firebase-admin/app");
      const admin = adminDb(
        getApps().find((a) => a.name === "rabbit-agent-gateway")!,
      );
      await admin
        .doc(`groups/${circle.id}`)
        .update({ memberIds: [auths[1].currentUser!.uid] });
      assert.equal(
        (
          await call(`/api/agent/posts/${post.id}/feedback`, token, "PUT", {
            kind: "outdated",
            active: true,
          })
        ).status,
        403,
      );
      const draft = (
        await call("/api/agent/drafts", token, "POST", {
          title: "Proposal",
          body: "Review",
        })
      ).data;
      assert.equal(
        (await call(`/api/agents/drafts/${draft.id}/publish`, eve, "POST", {}))
          .status,
        404,
      );
      assert.equal(
        (
          await call(
            `/api/agents/drafts/${draft.id}/publish`,
            alice,
            "POST",
            {},
          )
        ).status,
        200,
      );
      for (const db of dbs) {
        await assert.rejects(
          getDoc(doc(db, "agentAccounts", uid)),
          /permission/i,
        );
        await assert.rejects(
          setDoc(doc(db, "agentAccounts", uid), {
            ownerId: uid,
            connections: [],
          }),
          /permission/i,
        );
        await assert.rejects(
          updateDoc(doc(db, "agentAccounts", uid), { activity: [] }),
          /permission/i,
        );
      }
      assert.equal(
        (
          await call(
            `/api/agents/tokens/${connection.data.connection.id}`,
            alice,
            "DELETE",
          )
        ).status,
        200,
      );
      assert.equal((await call("/api/agent/search", token)).status, 401);
      // Disabled users cannot keep using agent credentials.
      const next = (
        await call("/api/agents/tokens", alice, "POST", { name: "Next" })
      ).data;
      const { getAuth } = await import("firebase-admin/auth");
      await getAuth(
        getApps().find((a) => a.name === "rabbit-agent-gateway")!,
      ).updateUser(uid, { disabled: true });
      assert.equal((await call("/api/agent/search", next.token)).status, 401);
    } finally {
      app.server.close();
      await once(app.server, "close");
      app.close();
      await Promise.all(apps.map(deleteApp));
    }
  },
);

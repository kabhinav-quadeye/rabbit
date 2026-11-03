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
  setLogLevel,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  arrayUnion,
  writeBatch,
} from "firebase/firestore";
import { createFirebaseService } from "../src/firebase-service.ts";
import type {
  Bootstrap,
  FriendRequest,
  Group,
  Post,
  User,
} from "../src/types.ts";

test(
  "Firebase friendship consent and group rules cannot be bypassed by direct writes",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 90000 },
  async () => {
    setLogLevel("silent"); // Permission denials below are intentional assertions.
    const apps = [0, 1, 2].map((i) =>
      initializeApp(
        { apiKey: "fake-key", projectId: "demo-rabbit-friends" },
        `friends-${i}-${Date.now()}`,
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
    const [alice, bob, eve] = services.map((s) => s.request);
    const suffix = Date.now();
    try {
      for (const [i, request] of [alice, bob, eve].entries()) {
        await request("/auth/register", "POST", {
          name: `Reader ${i}`,
          email: `reader${i}-${suffix}`,
          password: "rabbit-test-password",
        });
      }
      const [a, b, e] = auths.map((auth) => auth.currentUser!.uid);
      assert.deepEqual(
        (await alice<User[]>(`/users?q=READER1-${suffix}`)).map((u) => u.id),
        [b],
      );
      const group = await alice<Group>("/groups", "POST", {
        name: "Friends only",
      });
      await assert.rejects(
        alice("/groups", "POST", { name: "Strangers", memberIds: [b] }),
        /friends/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[0], "groups", group.id), { memberIds: [a, b] }),
        /permission/i,
      );
      const request = await alice<FriendRequest>("/friends/requests", "POST", {
        recipientId: b,
      });
      await assert.rejects(
        alice(`/friends/requests/${request.id}`, "PATCH", {
          status: "accepted",
        }),
        /recipient/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[0], "friendRequests", request.id), {
          status: "accepted",
        }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[2], "friendRequests", request.id), {
          status: "accepted",
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(databases[0], "friendLists", a), {
          ids: [b],
          requestId: request.id,
        }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[0], "groups", group.id), {
          memberIds: arrayUnion(b),
        }),
        /permission/i,
      );
      await bob(`/friends/requests/${request.id}`, "PATCH", {
        status: "accepted",
      });
      assert.deepEqual((await alice<Bootstrap>("/bootstrap")).friendIds, [b]);
      assert.deepEqual((await bob<Bootstrap>("/bootstrap")).friendIds, [a]);
      assert.deepEqual((await eve<Bootstrap>("/bootstrap")).friendRequests, []);
      await alice(`/groups/${group.id}/members`, "POST", { memberIds: [b] });
      assert.deepEqual(
        (await getDoc(doc(databases[1], "groups", group.id))).data()!.memberIds,
        [a, b],
      );
      await assert.rejects(
        updateDoc(doc(databases[1], "groups", group.id), {
          memberIds: arrayUnion(e),
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(databases[1], "groups", "forged"), {
          ...group,
          id: "forged",
          ownerId: b,
          memberIds: [b, e],
        }),
        /permission/i,
      );
      // Legacy documents have no outdatedBy field; no migration is required.
      const post: Post = {
        id: `legacy-${suffix}`,
        authorId: a,
        audienceType: "group",
        audienceId: group.id,
        title: "Old guide",
        body: "Check the current version",
        tags: [],
        type: "note",
        createdAt: new Date().toISOString(),
        votes: [],
        savedBy: [],
        comments: [],
      };
      const postRef = (i: number) => doc(databases[i], "posts", post.id);
      await setDoc(postRef(0), post);
      // Interactions must retain both readers' changes and reject forged direct writes.
      for (const action of ["save", "vote", "comments"]) {
        await assert.rejects(
          eve(`/posts/${post.id}/${action}`, "POST", { body: "No access" }),
          /access/i,
        );
      }
      for (const field of ["votes", "savedBy"]) {
        await assert.rejects(
          updateDoc(postRef(2), { [field]: [e] }),
          /permission/i,
        );
        await assert.rejects(
          updateDoc(postRef(1), { [field]: [a] }),
          /permission/i,
        );
        await updateDoc(postRef(1), { [field]: [b] });
        await assert.rejects(
          updateDoc(postRef(0), { [field]: [] }),
          /permission/i,
        );
        await assert.rejects(
          updateDoc(postRef(0), { [field]: [b, a, a] }),
          /permission/i,
        );
        await assert.rejects(
          updateDoc(postRef(0), { [field]: [b, a], body: "Rewritten" }),
          /permission/i,
        );
      }
      const comment = {
        id: `comment-${suffix}`,
        authorId: b,
        body: "A helpful resource",
        createdAt: new Date().toISOString(),
      };
      await assert.rejects(
        updateDoc(postRef(0), { comments: [comment] }),
        /permission/i,
      );
      await updateDoc(postRef(1), { comments: [comment] });
      await assert.rejects(
        updateDoc(postRef(1), { comments: [] }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(postRef(1), { comments: [{ ...comment, body: "Edited" }] }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(postRef(0), {
          comments: [
            comment,
            {
              ...comment,
              id: "oversized",
              authorId: a,
              body: "x".repeat(4001),
            },
          ],
        }),
        /permission/i,
      );
      for (const action of ["save", "vote"]) {
        // Bob removes only his own entry; concurrent transactions retain both readers.
        await bob(`/posts/${post.id}/${action}`, "POST");
        await Promise.all([
          alice(`/posts/${post.id}/${action}`, "POST"),
          bob(`/posts/${post.id}/${action}`, "POST"),
        ]);
      }
      await Promise.all([
        alice(`/posts/${post.id}/comments`, "POST", { body: "Alice's reply" }),
        bob(`/posts/${post.id}/comments`, "POST", { body: "Bob's reply" }),
      ]);
      const reloaded = createFirebaseService(auths[0], databases[0]);
      const persisted = (
        await reloaded.request<Bootstrap>("/bootstrap")
      ).posts.find((p) => p.id === post.id)!;
      assert.deepEqual(new Set(persisted.votes), new Set([a, b]));
      assert.deepEqual(new Set(persisted.savedBy), new Set([a, b]));
      assert.equal(persisted.comments.length, 3);
      assert.deepEqual(
        new Set(persisted.comments.map((c) => c.body)),
        new Set(["A helpful resource", "Alice's reply", "Bob's reply"]),
      );
      await assert.rejects(
        updateDoc(postRef(2), { outdatedBy: [e] }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(postRef(1), { outdatedBy: [a] }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(postRef(1), { outdatedBy: "outdated" }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(databases[0], "posts", `forged-${suffix}`), {
          ...post,
          id: `forged-${suffix}`,
          outdatedBy: [b],
        }),
        /permission/i,
      );
      await updateDoc(postRef(1), { outdatedBy: [b] });
      assert.deepEqual((await getDoc(postRef(0))).data()!.outdatedBy, [b]);
      await assert.rejects(
        updateDoc(postRef(0), { outdatedBy: [] }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(postRef(0), { outdatedBy: [b, a, a] }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(postRef(0), { outdatedBy: [b, a], body: "Changed" }),
        /permission/i,
      );
      await alice(`/posts/${post.id}/outdated`, "POST");
      assert.deepEqual(
        new Set((await getDoc(postRef(0))).data()!.outdatedBy),
        new Set([a, b]),
      );
      await bob(`/posts/${post.id}/outdated`, "POST");
      assert.deepEqual((await getDoc(postRef(0))).data()!.outdatedBy, [a]);
      await alice(`/posts/${post.id}/outdated`, "POST");
      assert.deepEqual((await getDoc(postRef(0))).data()!.outdatedBy, []);
      const fresh = await alice<Post>("/posts", "POST", {
        audienceType: "self",
        title: "Fresh",
        body: "Current",
        outdatedBy: [b],
      });
      assert.deepEqual(fresh.outdatedBy, []);
      const forged = writeBatch(databases[2]);
      forged.set(doc(databases[2], "friendRequests", `${e}:${a}`), {
        id: `${e}:${a}`,
        senderId: e,
        recipientId: a,
        status: "accepted",
      });
      forged.set(doc(databases[2], "friendLists", e), {
        ids: [a],
        requestId: `${e}:${a}`,
      });
      await assert.rejects(forged.commit(), /permission/i);
      await assert.rejects(
        updateDoc(doc(databases[0], "friendRequests", request.id), {
          recipientId: e,
        }),
        /permission/i,
      );
      const profile = (await alice<Bootstrap>("/bootstrap")).currentUser;
      await assert.rejects(
        setDoc(doc(databases[2], "usernames", profile.handle), { userId: e }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[2], "users", e), { handle: profile.handle }),
        /permission/i,
      );
      const pending = await eve<FriendRequest>("/friends/requests", "POST", {
        recipientId: b,
      });
      await bob(`/friends/requests/${pending.id}`, "PATCH", {
        status: "declined",
      });
      assert.deepEqual((await eve<Bootstrap>("/bootstrap")).friendIds, []);
      await eve("/friends/requests", "POST", { recipientId: b });
      // Accepting another friend must preserve Bob's existing friendship.
      await bob(`/friends/requests/${pending.id}`, "PATCH", {
        status: "accepted",
      });
      assert.deepEqual(
        new Set(
          (await getDoc(doc(databases[1], "friendLists", b))).data()!.ids,
        ),
        new Set([a, e]),
      );
    } finally {
      await Promise.all(apps.map(deleteApp));
    }
  },
);

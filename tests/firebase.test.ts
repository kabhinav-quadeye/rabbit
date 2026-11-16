import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, deleteUser } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  collection,
  getDocs,
} from "firebase/firestore";
import type { Bootstrap, Group, Post } from "../src/types.ts";

test(
  "Firebase credentials, persistent features, concurrent updates, and access rules",
  { skip: process.env.RUN_FIREBASE_TESTS !== "1", timeout: 120000 },
  async () => {
    const { createFirebaseService } =
      await import("../src/firebase-service.ts");
    const config = {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    };
    const apps = [
      initializeApp(config, `reader-${Date.now()}`),
      initializeApp(config, `outsider-${Date.now()}`),
    ];
    const auths = apps.map((app) =>
      initializeAuth(app, { persistence: inMemoryPersistence }),
    );
    const databases = apps.map((app) => getFirestore(app));
    const services = auths.map((auth, i) =>
      createFirebaseService(auth, databases[i]),
    );
    const request = services[0].request;
    let postId = "",
      groupId = "";
    try {
      await assert.rejects(request("/bootstrap"), /sign in/i);
      await services[0].request("/auth/login", "POST", {
        email: "alex",
        password: "alex",
      });
      const seeded = await request<Bootstrap>("/bootstrap");
      assert.equal(seeded.currentUser.id, "alex");
      assert.equal(seeded.groups.length, 3);
      assert.ok(seeded.posts.some((p) => p.id === "personal-note"));
      assert.ok(seeded.posts.some((p) => p.id === "direct-note"));
      assert.equal(seeded.users.length >= 6, true);
      assert.ok(seeded.users.every((u) => !u.email));
      await request("/auth/logout", "POST");
      await assert.rejects(
        request("/auth/login", "POST", { email: "alex", password: "wrong" }),
        /incorrect/i,
      );
      for (let i = 0; i < 2; i++) {
        await services[i].request("/auth/register", "POST", {
          name: i ? "Test Outsider" : "Test Reader",
          email: `firebase-test-${i}-${Date.now()}@example.com`,
          password: "rabbit-test-password-123",
        });
      }
      const readerId = auths[0].currentUser!.uid,
        outsiderId = auths[1].currentUser!.uid;
      const fresh = await request<Bootstrap>("/bootstrap");
      assert.deepEqual(fresh.posts, []);
      assert.deepEqual(fresh.groups, []);
      await request("/profile", "PATCH", {
        name: "Test Reader Updated",
        bio: "Kept in Firestore",
      });
      assert.equal(
        (await request<Bootstrap>("/bootstrap")).currentUser.bio,
        "Kept in Firestore",
      );
      const post = await request<Post>("/posts", "POST", {
        title: "Persistent secret",
        body: "only me",
        audienceType: "self",
        tags: ["Books", "books"],
      });
      postId = post.id;
      assert.deepEqual(post.tags, ["books"]);
      assert.equal(
        (await getDoc(doc(databases[0], "posts", post.id))).data()!.title,
        "Persistent secret",
      );
      await assert.rejects(
        getDoc(doc(databases[1], "posts", post.id)),
        /permission/i,
      );
      await assert.rejects(
        getDocs(collection(databases[1], "posts")),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(databases[1], "users", readerId), {
          name: "Impersonated",
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(databases[1], "users", "forged"), {
          id: "forged",
          name: "Forged",
          handle: "forged",
          bio: "",
          color: "sage",
        }),
        /permission/i,
      );
      await assert.rejects(
        services[1].request(`/posts/${post.id}/save`, "POST"),
        /access|permission/i,
      );
      const group = await request<Group>("/groups", "POST", {
        name: "Test Firebase circle",
        memberIds: [],
      });
      groupId = group.id;
      await assert.rejects(
        updateDoc(doc(databases[1], "groups", group.id), {
          memberIds: arrayUnion(outsiderId),
        }),
        /permission/i,
      );
      const friendRequest = await request<{ id: string }>(
        "/friends/requests",
        "POST",
        { recipientId: outsiderId },
      );
      await services[1].request(
        `/friends/requests/${friendRequest.id}`,
        "PATCH",
        { status: "accepted" },
      );
      await request(`/groups/${group.id}/members`, "POST", {
        memberIds: [outsiderId],
      });
      assert.equal(
        (await services[1].request<Bootstrap>("/bootstrap")).groups[0].id,
        group.id,
      );
      // Add a shared post after the private note has proved outsider isolation.
      const shared = await request<Post>("/posts", "POST", {
        title: "Shared Firebase book",
        body: "Read together",
        audienceType: "group",
        audienceId: group.id,
      });
      try {
        await Promise.all([
          request(`/posts/${shared.id}/vote`, "POST"),
          services[1].request(`/posts/${shared.id}/vote`, "POST"),
        ]);
        const voted = (
          await getDoc(doc(databases[0], "posts", shared.id))
        ).data()!;
        assert.deepEqual(new Set(voted.votes), new Set([readerId, outsiderId]));
        await assert.rejects(
          updateDoc(doc(databases[1], "posts", shared.id), {
            body: "tampered",
          }),
          /permission/i,
        );
        await assert.rejects(
          updateDoc(doc(databases[1], "posts", shared.id), { votes: [] }),
          /permission/i,
        );
        await request(`/posts/${shared.id}/save`, "POST");
        await request(`/posts/${shared.id}/comments`, "POST", {
          body: " Thanks! ",
        });
        const found = await request<{ posts: Post[] }>(
          "/search?q=Firebase&scope=saved",
        );
        assert.equal(found.posts.length, 1);
        assert.equal(found.posts[0].id, shared.id);
        assert.equal(found.posts[0].comments[0].body, "Thanks!");
        assert.equal(found.posts[0].comments[0].authorId, readerId);
        await request(`/posts/${shared.id}/save`, "POST");
        assert.deepEqual(
          (await request<{ posts: Post[] }>("/search?q=Firebase&scope=saved"))
            .posts,
          [],
        );
      } finally {
        await deleteDoc(doc(databases[0], "posts", shared.id));
      }
      const email = auths[0].currentUser!.email;
      await request("/auth/logout", "POST");
      await assert.rejects(request("/bootstrap"), /sign in/i);
      await request("/auth/login", "POST", {
        email,
        password: "rabbit-test-password-123",
      });
      assert.ok(
        (await request<Bootstrap>("/bootstrap")).posts.some(
          (p) => p.id === post.id,
        ),
      );
    } finally {
      if (postId) await deleteDoc(doc(databases[0], "posts", postId));
      if (groupId) await deleteDoc(doc(databases[0], "groups", groupId));
      for (let i = 0; i < auths.length; i++) {
        const user = auths[i].currentUser;
        if (user && user.uid !== "alex") {
          await deleteDoc(doc(databases[i], "users", user.uid));
          await deleteUser(user);
        }
      }
      await Promise.all(apps.map(deleteApp));
    }
  },
);

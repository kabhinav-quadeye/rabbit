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
  setLogLevel,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  deleteDoc,
} from "firebase/firestore";
import { createFirebaseService } from "../src/firebase-service.ts";
import { createService } from "../src/domain.ts";
import type {
  Post,
  SearchPage,
  User,
  Group,
  FriendRequest,
} from "../src/types.ts";

test(
  "indexed Firebase search matches local pages and enforces privacy even with forged direct writes",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 90000 },
  async () => {
    setLogLevel("silent");
    const apps = [0, 1].map((i) =>
      initializeApp(
        { apiKey: "fake-key", projectId: "demo-rabbit-friends" },
        `search-${i}-${Date.now()}`,
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
    const services = auths.map((a, i) => createFirebaseService(a, dbs[i]));
    try {
      for (const [i, s] of services.entries())
        await s.request("/auth/register", "POST", {
          name: `Search Reader ${i}`,
          email: `search${i}${Date.now()}`,
          password: "rabbit-test-password",
        });
      const [a, b] = auths.map((a) => a.currentUser!.uid);
      const posts: Post[] = [];
      for (let i = 0; i < 28; i++)
        posts.push(
          await services[0].request<Post>("/posts", "POST", {
            audienceType: "self",
            title: `Orchid garden ${i}`,
            body: "A guide to plants",
            tags: ["plants"],
          }),
        );
      const secret = await services[1].request<Post>("/posts", "POST", {
        audienceType: "self",
        title: "Orchid secret",
        body: "Not for others",
      });
      posts.push(
        await services[0].request<Post>("/posts", "POST", {
          audienceType: "user",
          audienceId: b,
          title: "Orchid shared",
          body: "For reader 1",
        }),
      );
      const remote = await services[0].request<SearchPage>("/search?q=orchid");
      assert.equal(remote.posts.length, 25);
      assert.ok(remote.nextCursor);
      const local = createService({
        users: [{ id: a, name: "Search Reader 0", handle: "local" }],
        groups: [],
        posts,
      }).searchPage(a, "orchid");
      assert.deepEqual(
        remote.posts.map((p) => p.id),
        local.posts.map((p) => p.id),
      );
      assert.equal(remote.nextCursor, local.nextCursor);
      const second = await services[0].request<SearchPage>(
        `/search?q=orchid&cursor=${remote.nextCursor}`,
      );
      const all = [...remote.posts, ...second.posts];
      assert.equal(new Set(all.map((p) => p.id)).size, 29);
      assert.ok(!all.some((p) => p.id === secret.id));
      await assert.rejects(
        getDocs(
          query(
            collection(dbs[0], "posts"),
            where("searchTokens", "array-contains", "orchid"),
            limit(25),
          ),
        ),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(dbs[0], "posts", secret.id), {
          searchTokens: ["orchid"],
        }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(dbs[0], "posts", posts[0].id), {
          searchTokens: ["forged"],
        }),
        /permission/i,
      );
      // Tokens are hints, never matching or access authority: validate real content.
      const forged = {
        ...posts[0],
        id: `forged-${Date.now()}`,
        title: "Unrelated",
        body: "Nothing",
        tags: [],
        searchTokens: ["orchid"],
      };
      await setDoc(
        doc(dbs[0], "posts", forged.id),
        JSON.parse(JSON.stringify(forged)),
      );
      assert.equal(
        (await services[0].request<SearchPage>("/search?q=orchid")).posts.some(
          (p) => p.id === forged.id,
        ),
        false,
      );
      await assert.rejects(
        setDoc(doc(dbs[0], "posts", "malformed"), {
          ...JSON.parse(JSON.stringify(forged)),
          id: "malformed",
          searchTokens: "orchid",
        }),
        /permission/i,
      );
      const shared = posts.find((p) => p.audienceType === "user")!;
      assert.deepEqual(
        (
          await services[1].request<SearchPage>("/search?q=orchid&scope=people")
        ).posts.map((p) => p.id),
        [shared.id],
      );
      await services[0].request(`/posts/${remote.posts[0].id}/save`, "POST");
      assert.deepEqual(
        (
          await services[0].request<SearchPage>("/search?q=orchid&scope=saved")
        ).posts.map((p) => p.id),
        [remote.posts[0].id],
      );
      const invite = await services[0].request<FriendRequest>(
        "/friends/requests",
        "POST",
        { recipientId: b },
      );
      await services[1].request(`/friends/requests/${invite.id}`, "PATCH", {
        status: "accepted",
      });
      const circle = await services[0].request<Group>("/groups", "POST", {
        name: "Botanical circle",
        memberIds: [b],
      });
      const circlePost = await services[0].request<Post>("/posts", "POST", {
        audienceType: "group",
        audienceId: circle.id,
        title: "Moss field guide",
        body: "Forest observations",
      });
      for (const scope of ["groups", "circles"])
        assert.deepEqual(
          (
            await services[1].request<SearchPage>(
              `/search?q=botanical&scope=${scope}`,
            )
          ).posts.map((p) => p.id),
          [circlePost.id],
        );
      await services[0].request("/profile", "PATCH", {
        name: "Naturalist",
        bio: "",
      });
      assert.deepEqual(
        (
          await services[1].request<SearchPage>("/search?q=naturalist moss")
        ).posts.map((p) => p.id),
        [circlePost.id],
      );
      // Deleting the circle revokes member access; old cursors confer no rights.
      await deleteDoc(doc(dbs[0], "groups", circle.id));
      assert.deepEqual(
        (await services[1].request<SearchPage>("/search?q=moss")).posts,
        [],
      );
      const readers = await services[0].request<User[]>("/users?q=search");
      assert.ok(readers.some((u) => u.id === b));
    } finally {
      await Promise.all(apps.map(deleteApp));
    }
  },
);

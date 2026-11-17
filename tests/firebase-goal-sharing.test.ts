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
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { createFirebaseService } from "../src/firebase-service.ts";
import type {
  FriendRequest,
  Goal,
  GoalTask,
  GoalsOverview,
} from "../src/types.ts";

test(
  "Firebase shared goals let members collaborate and keep strangers out",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 120000 },
  async () => {
    setLogLevel("silent"); // Permission denials below are intentional assertions.
    const apps = [0, 1, 2, 3].map((i) =>
      initializeApp(
        { apiKey: "fake-key", projectId: "demo-rabbit-friends" },
        `goal-sharing-${i}-${Date.now()}`,
      ),
    );
    const auths = apps.map((app) => {
      const auth = initializeAuth(app, { persistence: inMemoryPersistence });
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
    const [alice, bob, cara, eve] = auths.map(
      (auth, i) => createFirebaseService(auth, dbs[i]).request,
    );
    const suffix = Date.now();
    try {
      for (const [i, request] of [alice, bob, cara, eve].entries())
        await request("/auth/register", "POST", {
          name: `Sharer ${i}`,
          email: `sharer${i}-${suffix}`,
          password: "rabbit-test-password",
        });
      const [a, b, c, e] = auths.map((auth) => auth.currentUser!.uid);
      const [adb, bdb, cdb, edb] = dbs;
      const befriend = async (
        from: typeof alice,
        to: typeof alice,
        id: string,
      ) => {
        const r = await from<FriendRequest>("/friends/requests", "POST", {
          recipientId: id,
        });
        await to(`/friends/requests/${r.id}`, "PATCH", { status: "accepted" });
      };
      await befriend(alice, bob, b);
      await befriend(bob, cara, c);

      // Sharing while creating
      const trip = await alice<Goal>("/goals", "POST", {
        title: "Plan the trip",
        memberIds: [b],
      });
      assert.deepEqual(trip.memberIds, [a, b]);
      await assert.rejects(
        alice("/goals", "POST", { title: "x", memberIds: [e] }),
        /friends/i,
      );
      await assert.rejects(
        setDoc(doc(adb, "goals", "with-stranger"), {
          ...trip,
          id: "with-stranger",
          memberIds: [a, e],
        }),
        /permission/i,
      );

      // Sharing an existing goal brings its history along, including a goal
      // written before sharing existed (no memberIds).
      const { memberIds: _none, ...legacy } = {
        ...trip,
        id: `legacy-${suffix}`,
        title: "Old goal",
      };
      await setDoc(doc(adb, "goals", legacy.id), legacy);
      const [old] = await alice<GoalTask[]>(
        `/goals/${legacy.id}/tasks`,
        "POST",
        {
          description: "Done long ago",
        },
      );
      await alice(`/tasks/${old.id}/complete`, "POST", { cascade: false });
      assert.equal((await bob<GoalsOverview>("/goals")).goals.length, 1);
      assert.deepEqual(
        (
          await alice<Goal>(`/goals/${legacy.id}/members`, "POST", {
            memberIds: [b],
          })
        ).memberIds,
        [a, b],
      );
      let view = await bob<GoalsOverview>("/goals");
      assert.deepEqual(
        view.goals.map((g) => g.id).sort(),
        [legacy.id, trip.id].sort(),
      );
      assert.deepEqual(
        view.tasks.map((t) => [t.description, t.status]),
        [["Done long ago", "done"]],
      );

      // Members add, edit, complete and reopen tasks together
      const [book] = await bob<GoalTask[]>(`/goals/${trip.id}/tasks`, "POST", {
        description: "Book",
      });
      assert.equal(book.ownerId, a);
      const [flights] = await alice<GoalTask[]>(
        `/goals/${trip.id}/tasks`,
        "POST",
        { description: "Flights", parentId: book.id },
      );
      await bob(`/tasks/${flights.id}`, "PATCH", { notes: "Window seat" });
      const done = await bob<GoalTask[]>(`/tasks/${book.id}/complete`, "POST", {
        cascade: true,
      });
      assert.deepEqual(
        done.map((t) => t.completedBy),
        [b, b],
      );
      const overview = await alice<GoalsOverview>("/goals");
      assert.equal(
        overview.tasks.find((t) => t.id === flights.id)?.completedBy,
        b,
      );
      await alice(`/tasks/${flights.id}/reopen`, "POST", {});

      // Members cannot change the goal's settings or claim others' work
      await assert.rejects(
        bob(`/goals/${trip.id}`, "PATCH", { title: "Mine" }),
        /owner/i,
      );
      await assert.rejects(bob(`/goals/${trip.id}`, "DELETE"), /owner/i);
      await assert.rejects(
        updateDoc(doc(bdb, "goals", trip.id), { title: "Mine" }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(bdb, "goalTasks", flights.id), {
          status: "done",
          completedAt: new Date().toISOString(),
          completedBy: a,
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(bdb, "goalTasks", `bob-owned-${suffix}`), {
          ...flights,
          id: `bob-owned-${suffix}`,
          ownerId: b,
          parentId: null,
          depth: 0,
          status: "open",
          completedAt: null,
        }),
        /permission/i,
      );

      // Strangers see nothing and cannot let themselves in
      assert.deepEqual(await eve<GoalsOverview>("/goals"), {
        goals: [],
        tasks: [],
      });
      await assert.rejects(getDoc(doc(edb, "goals", trip.id)), /permission/i);
      await assert.rejects(
        getDocs(
          query(collection(edb, "goalTasks"), where("goalId", "==", trip.id)),
        ),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(edb, "goals", trip.id), { memberIds: arrayUnion(e) }),
        /permission/i,
      );
      await assert.rejects(
        eve(`/goals/${trip.id}/members`, "POST", { memberIds: [e] }),
        /not found/i,
      );

      // A member invites their own friend, as in circles
      assert.deepEqual(
        (
          await bob<Goal>(`/goals/${trip.id}/members`, "POST", {
            memberIds: [c],
          })
        ).memberIds,
        [a, b, c],
      );
      assert.equal(
        (await cara<GoalsOverview>("/goals")).tasks.length,
        2,
        "the new member sees every existing task",
      );
      await assert.rejects(
        updateDoc(doc(cdb, "goals", trip.id), { memberIds: [a, c] }),
        /permission/i,
        "only the owner removes other people",
      );
      await assert.rejects(
        updateDoc(doc(bdb, "goals", trip.id), { memberIds: [b, c] }),
        /permission/i,
        "nobody removes the owner",
      );

      // Leaving and removal
      assert.deepEqual(
        (await cara<Goal>(`/goals/${trip.id}/members/${c}`, "DELETE"))
          .memberIds,
        [a, b],
      );
      assert.deepEqual(await cara<GoalsOverview>("/goals"), {
        goals: [],
        tasks: [],
      });
      await assert.rejects(
        bob(`/goals/${trip.id}/members/${a}`, "DELETE"),
        /owner/i,
      );
      assert.deepEqual(
        (await alice<Goal>(`/goals/${trip.id}/members/${b}`, "DELETE"))
          .memberIds,
        [a],
      );
      view = await bob<GoalsOverview>("/goals");
      assert.deepEqual(
        view.goals.map((g) => g.id),
        [legacy.id],
      );
      await assert.rejects(getDoc(doc(bdb, "goals", trip.id)), /permission/i);

      // The owner still edits settings and deletes the goal with its tasks
      assert.equal(
        (
          await alice<Goal>(`/goals/${legacy.id}`, "PATCH", {
            title: "Renamed",
          })
        ).title,
        "Renamed",
      );
      assert.deepEqual(
        (await bob<GoalsOverview>("/goals")).goals.map((g) => g.title),
        ["Renamed"],
      );
      await alice(`/goals/${legacy.id}`, "DELETE");
      assert.deepEqual(await bob<GoalsOverview>("/goals"), {
        goals: [],
        tasks: [],
      });
    } finally {
      await Promise.all(apps.map(deleteApp));
    }
  },
);

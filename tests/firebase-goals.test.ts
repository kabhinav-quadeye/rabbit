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
  writeBatch,
} from "firebase/firestore";
import { createFirebaseService } from "../src/firebase-service.ts";
import type { Goal, GoalTask, GoalsOverview } from "../src/types.ts";

test(
  "Firebase goals stay private and structurally valid under direct writes",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 90000 },
  async () => {
    setLogLevel("silent"); // Permission denials below are intentional assertions.
    const apps = [0, 1].map((i) =>
      initializeApp(
        { apiKey: "fake-key", projectId: "demo-rabbit-friends" },
        `goals-${i}-${Date.now()}`,
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
    const [alice, eve] = auths.map(
      (auth, i) => createFirebaseService(auth, dbs[i]).request,
    );
    const suffix = Date.now();
    try {
      for (const [i, request] of [alice, eve].entries())
        await request("/auth/register", "POST", {
          name: `Goal reader ${i}`,
          email: `goals${i}-${suffix}`,
          password: "rabbit-test-password",
        });
      const [a, e] = auths.map((auth) => auth.currentUser!.uid);
      const [adb, edb] = dbs;

      // Service flow
      assert.deepEqual(await alice<GoalsOverview>("/goals"), {
        goals: [],
        tasks: [],
      });
      const goal = await alice<Goal>("/goals", "POST", {
        title: "Run a half marathon",
        icon: "run",
      });
      const other = await alice<Goal>("/goals", "POST", { title: "Other" });
      const [parent] = await alice<GoalTask[]>(
        `/goals/${goal.id}/tasks`,
        "POST",
        { description: "Gear" },
      );
      const [child] = await alice<GoalTask[]>(
        `/goals/${goal.id}/tasks`,
        "POST",
        {
          description: "Shoes",
          parentId: parent.id,
        },
      );
      assert.equal(child.depth, 1);
      const patched = await alice<GoalTask>(`/tasks/${child.id}`, "PATCH", {
        priority: "high",
        notes: "Size 9",
      });
      assert.equal(patched.priority, "high");
      await assert.rejects(
        alice(`/tasks/${parent.id}/complete`, "POST", { cascade: false }),
        /1 open sub-task/,
      );
      assert.equal(
        (
          await alice<GoalTask[]>(`/tasks/${parent.id}/complete`, "POST", {
            cascade: true,
          })
        ).length,
        2,
      );
      assert.equal(
        (await alice<GoalTask[]>(`/tasks/${child.id}/reopen`, "POST", {}))
          .length,
        2,
      );
      const overview = await alice<GoalsOverview>("/goals");
      assert.equal(overview.goals.length, 2);
      assert.equal(overview.tasks.length, 2);
      assert.equal(
        (await alice<Goal>(`/goals/${goal.id}`, "PATCH", { status: "reached" }))
          .status,
        "reached",
      );

      // Another user cannot see or touch the goals through the service
      assert.deepEqual(await eve<GoalsOverview>("/goals"), {
        goals: [],
        tasks: [],
      });
      await assert.rejects(
        eve(`/goals/${goal.id}`, "PATCH", { title: "Mine" }),
        /not found/i,
      );
      await assert.rejects(
        eve(`/tasks/${child.id}`, "PATCH", { notes: "x" }),
        /not found/i,
      );
      await assert.rejects(
        eve(`/goals/${goal.id}/tasks`, "POST", { description: "x" }),
        /not found/i,
      );

      // ...or by direct reads and writes
      await assert.rejects(getDoc(doc(edb, "goals", goal.id)), /permission/i);
      await assert.rejects(
        getDoc(doc(edb, "goalTasks", child.id)),
        /permission/i,
      );
      await assert.rejects(
        getDocs(query(collection(edb, "goalTasks"), where("ownerId", "==", a))),
        /permission/i,
      );
      const valid = (over: Partial<GoalTask>): GoalTask => ({
        id: over.id!,
        ownerId: e,
        goalId: goal.id,
        parentId: null,
        depth: 0,
        description: "Intrude",
        notes: "",
        priority: "none",
        dueDate: null,
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        ...over,
      });
      await assert.rejects(
        setDoc(
          doc(edb, "goalTasks", "eve-in-alice"),
          valid({ id: "eve-in-alice" }),
        ),
        /permission/i,
      );
      await assert.rejects(
        setDoc(
          doc(edb, "goalTasks", "eve-as-alice"),
          valid({ id: "eve-as-alice", ownerId: a }),
        ),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(edb, "goals", goal.id), { title: "Mine" }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(edb, "goalTasks", child.id), { notes: "x" }),
        /permission/i,
      );

      // The owner cannot break structure or immutable fields
      const mine = (over: Partial<GoalTask>) => valid({ ownerId: a, ...over });
      await assert.rejects(
        setDoc(
          doc(adb, "goalTasks", "cross"),
          mine({
            id: "cross",
            goalId: other.id,
            parentId: parent.id,
            depth: 1,
          }),
        ),
        /permission/i,
      );
      await assert.rejects(
        setDoc(
          doc(adb, "goalTasks", "deep"),
          mine({ id: "deep", parentId: parent.id, depth: 3 }),
        ),
        /permission/i,
      );
      await assert.rejects(
        setDoc(
          doc(adb, "goalTasks", "rootdeep"),
          mine({ id: "rootdeep", depth: 1 }),
        ),
        /permission/i,
      );
      await assert.rejects(
        setDoc(doc(adb, "goalTasks", "extra"), {
          ...mine({ id: "extra" }),
          secret: true,
        }),
        /permission/i,
      );
      await assert.rejects(
        setDoc(
          doc(adb, "goalTasks", "longdesc"),
          mine({ id: "longdesc", description: "x".repeat(501) }),
        ),
        /permission/i,
      );
      await assert.rejects(
        setDoc(
          doc(adb, "goalTasks", "nogoal"),
          mine({ id: "nogoal", goalId: "missing" }),
        ),
        /permission/i,
      );
      for (const field of [
        { goalId: other.id },
        { parentId: null },
        { ownerId: e },
        { depth: 0 },
      ])
        await assert.rejects(
          updateDoc(doc(adb, "goalTasks", child.id), field),
          /permission/i,
        );
      await assert.rejects(
        updateDoc(doc(adb, "goals", goal.id), { ownerId: e }),
        /permission/i,
      );
      await assert.rejects(
        updateDoc(doc(adb, "goals", goal.id), { color: "neon" }),
        /permission/i,
      );

      // A batch can create a parent and its child together
      const batch = writeBatch(adb);
      batch.set(
        doc(adb, "goalTasks", `p-${suffix}`),
        mine({ id: `p-${suffix}` }),
      );
      batch.set(
        doc(adb, "goalTasks", `c-${suffix}`),
        mine({ id: `c-${suffix}`, parentId: `p-${suffix}`, depth: 1 }),
      );
      await batch.commit();

      // Deletion removes subtrees and goals with their tasks
      assert.equal(
        (await alice<{ ids: string[] }>(`/tasks/${parent.id}`, "DELETE")).ids
          .length,
        2,
      );
      await alice(`/goals/${goal.id}`, "DELETE");
      const after = await alice<GoalsOverview>("/goals");
      assert.deepEqual(
        after.goals.map((g) => g.id),
        [other.id],
      );
      assert.deepEqual(after.tasks, []);
    } finally {
      await Promise.all(apps.map(deleteApp));
    }
  },
);

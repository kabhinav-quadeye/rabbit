import {
  searchWords,
  mergeSearchStreams,
  SEARCH_PAGE_SIZE,
  indexToken,
} from "./search.ts";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  runTransaction,
  setDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  type Firestore,
  type QueryConstraint,
  documentId,
  orderBy,
  startAfter,
  limit,
} from "firebase/firestore";
import { createService } from "./domain.ts";
import { loginEmail } from "./identity.ts";
import type {
  State,
  FriendRequest,
  User,
  Post,
  Group,
  Bootstrap,
  PostInput,
  Goal,
  GoalTask,
} from "./types.ts";

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const authMessages: Record<string, string> = {
  "auth/invalid-credential": "Username, email or password is incorrect.",
  "auth/user-not-found": "Username, email or password is incorrect.",
  "auth/wrong-password": "Username, email or password is incorrect.",
  "auth/email-already-in-use":
    "An account with this username or email already exists. Sign in instead.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "Enter a valid username or email address.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed":
    "Couldn’t connect to Firebase. Check your connection and try again.",
  "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
  "auth/popup-blocked": "Allow popups in your browser to sign in with Google.",
  "auth/unauthorized-domain":
    "This address is not authorized for Google sign-in. Add it in Firebase Authentication settings.",
  "auth/operation-not-allowed":
    "This sign-in method is not enabled in Firebase Authentication.",
  "permission-denied": "You do not have access to this content.",
  unavailable:
    "Couldn’t connect to Firebase. Check your connection and try again.",
};

export function createFirebaseService(
  auth: Auth,
  db: Firestore,
  googleSignIn?: () => Promise<unknown>,
) {
  const id = () => {
    if (!auth.currentUser)
      throw new Error("Please sign in to open your space.");
    return auth.currentUser.uid;
  };
  const newId = () => doc(collection(db, "posts")).id;
  async function ensureProfile(requestedHandle?: string) {
    const uid = id(),
      account = auth.currentUser!;
    const ref = doc(db, "users", uid);
    await runTransaction(db, async (tx) => {
      const current = await tx.get(ref);
      const handle = current.exists()
        ? (current.data() as User).handle
        : (requestedHandle ??
          `reader-${uid
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 24)}`);
      const usernameRef = doc(db, "usernames", handle);
      const username = await tx.get(usernameRef);
      if (username.exists() && username.data().userId !== uid)
        throw new Error("This username is taken. Choose another username.");
      if (!username.exists()) tx.set(usernameRef, { userId: uid });
      if (current.exists()) return;
      const user: User = {
        id: uid,
        name: account.displayName || handle,
        handle,
        bio: "",
        color: "sage",
      };
      if (account.photoURL) user.avatar = account.photoURL;
      tx.set(ref, user);
    });
  }
  async function load(): Promise<Bootstrap> {
    const uid = id();
    await ensureProfile();
    const [users, groups, sent, received] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(
        query(
          collection(db, "groups"),
          where("memberIds", "array-contains", uid),
        ),
      ),
      getDocs(
        query(collection(db, "friendRequests"), where("senderId", "==", uid)),
      ),
      getDocs(
        query(
          collection(db, "friendRequests"),
          where("recipientId", "==", uid),
        ),
      ),
    ]);
    const circles = groups.docs.map((d) => d.data() as Group);
    const queries = [
      query(collection(db, "posts"), where("authorId", "==", uid)),
      query(
        collection(db, "posts"),
        where("audienceType", "==", "user"),
        where("audienceId", "==", uid),
      ),
      ...circles.map((g) =>
        query(
          collection(db, "posts"),
          where("audienceType", "==", "group"),
          where("audienceId", "==", g.id),
        ),
      ),
    ];
    const snapshots = await Promise.all(queries.map((q) => getDocs(q)));
    const posts = [
      ...new Map(
        snapshots.flatMap((s) =>
          s.docs.map((d) => [d.id, d.data() as Post] as const),
        ),
      ).values(),
    ];
    const state: State = {
      users: users.docs.map((d) => d.data() as User),
      groups: circles,
      posts,
      friendRequests: [...sent.docs, ...received.docs].map(
        (d) => d.data() as FriendRequest,
      ),
    };
    const space = createService(state).bootstrap(uid);
    space.currentUser.email = auth.currentUser!.email ?? undefined;
    return space;
  }
  async function search(uid: string, url: URL) {
    // Search deliberately runs before load(): no bootstrap/post scan per query.
    const [userDocs, groupDocs] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(
        query(
          collection(db, "groups"),
          where("memberIds", "array-contains", uid),
        ),
      ),
    ]);
    const users = userDocs.docs.map((d) => d.data() as User);
    const groups = groupDocs.docs.map((d) => d.data() as Group);
    const words = searchWords(url.searchParams.get("q") ?? "");
    const cursor = url.searchParams.get("cursor") ?? "";
    if (cursor.includes("/") || cursor.length > 1500)
      throw new Error("Invalid search cursor. Start a new search.");
    const branches: {
      filters: QueryConstraint[];
      author?: string;
      circle?: string;
    }[] = [
      { filters: [where("authorId", "==", uid)], author: uid },
      {
        filters: [
          where("audienceType", "==", "user"),
          where("audienceId", "==", uid),
        ],
      },
      ...groups.map((g) => ({
        filters: [
          where("audienceType", "==", "group"),
          where("audienceId", "==", g.id),
        ],
        circle: g.id,
      })),
    ];
    const matchingAuthors = users
      .filter((u) => searchWords(`${u.name} ${u.handle}`).includes(words[0]))
      .map((u) => u.id);
    const filters: QueryConstraint[][] = [];
    for (const branch of branches) {
      const circleMatch =
        branch.circle &&
        searchWords(groups.find((g) => g.id === branch.circle)!.name).includes(
          words[0],
        );
      if (
        !words.length ||
        circleMatch ||
        (branch.author && matchingAuthors.includes(branch.author))
      ) {
        filters.push(branch.filters);
      } else {
        filters.push([
          ...branch.filters,
          where("searchTokens", "array-contains", indexToken(words[0])),
        ]);
        if (!branch.author)
          for (const authorId of matchingAuthors)
            filters.push([
              ...branch.filters,
              where("authorId", "==", authorId),
            ]);
      }
    }
    // Keep concurrent RPCs bounded even for accounts with many circles.
    const streams: Post[][] = [];
    for (let i = 0; i < filters.length; i += 8) {
      streams.push(
        ...(await Promise.all(
          filters.slice(i, i + 8).map(async (f) => {
            const snapshot = await getDocs(
              query(
                collection(db, "posts"),
                ...f,
                orderBy(documentId()),
                ...(cursor ? [startAfter(cursor)] : []),
                limit(SEARCH_PAGE_SIZE),
              ),
            );
            return snapshot.docs.map(
              (d) => ({ ...d.data(), id: d.id }) as Post,
            );
          }),
        )),
      );
    }
    const page = mergeSearchStreams(streams);
    // Recheck actual content and domain permissions: client-written tokens are
    // untrusted hints. Names come from current metadata, so renames stay fresh.
    const app = createService({ users, groups, posts: page.posts });
    const matches = new Set(
      app
        .search(
          uid,
          url.searchParams.get("q") ?? "",
          url.searchParams.get("scope") ?? "all",
        )
        .map((p) => p.id),
    );
    return { ...page, posts: page.posts.filter((p) => matches.has(p.id)) };
  }
  // Goals are private, so they load only the owner's documents and never the
  // shared post state. The domain service validates; writes are atomic batches.
  /** goalId scopes tasks to one goal; null skips tasks; undefined loads all. */
  async function goalState(
    uid: string,
    goalId?: string | null,
  ): Promise<State> {
    const owned = (name: string) =>
      query(collection(db, name), where("ownerId", "==", uid));
    const [goalDocs, taskDocs] = await Promise.all([
      getDocs(owned("goals")),
      goalId === null
        ? null
        : getDocs(
            goalId
              ? query(owned("goalTasks"), where("goalId", "==", goalId))
              : owned("goalTasks"),
          ),
    ]);
    return {
      users: [],
      groups: [],
      posts: [],
      goals: goalDocs.docs.map((d) => d.data() as Goal),
      goalTasks: taskDocs?.docs.map((d) => d.data() as GoalTask) ?? [],
    };
  }
  async function commitGoalWrites(
    sets: (Goal | GoalTask)[],
    collectionName: "goals" | "goalTasks",
    deletes: { name: "goals" | "goalTasks"; id: string }[] = [],
  ) {
    // Firestore batches hold 500 writes; goals hold at most 500 tasks.
    const writes = [
      ...sets.map((value) => ({ kind: "set" as const, value })),
      ...deletes.map((target) => ({ kind: "delete" as const, target })),
    ];
    for (let i = 0; i < writes.length; i += 450) {
      const batch = writeBatch(db);
      for (const w of writes.slice(i, i + 450))
        if (w.kind === "set")
          batch.set(doc(db, collectionName, w.value.id), clean(w.value));
        else batch.delete(doc(db, w.target.name, w.target.id));
      await batch.commit();
    }
  }
  async function goals(uid: string, path: string, method: string, input: any) {
    const service = (state: State) => createService(state, undefined, newId);
    if (path === "/goals" && method === "GET")
      return service(await goalState(uid)).goalsOverview(uid);
    if (path === "/goals" && method === "POST") {
      const goal = service(await goalState(uid, null)).createGoal(uid, input);
      await commitGoalWrites([goal], "goals");
      return goal;
    }
    const goalMatch = path.match(/^\/goals\/([^/]+)(\/tasks)?$/);
    if (goalMatch) {
      const app = service(await goalState(uid, goalMatch[1]));
      if (goalMatch[2] && method === "POST") {
        const changed = app.createTask(uid, goalMatch[1], input);
        await commitGoalWrites(changed, "goalTasks");
        return changed;
      }
      if (!goalMatch[2] && method === "PATCH") {
        const goal = app.updateGoal(uid, goalMatch[1], input);
        await commitGoalWrites([goal], "goals");
        return goal;
      }
      if (!goalMatch[2] && method === "DELETE") {
        const removed = app.deleteGoal(uid, goalMatch[1]);
        // Tasks first, so a partial failure never leaves orphaned tasks.
        await commitGoalWrites([], "goalTasks", [
          ...removed.taskIds.map((id) => ({ name: "goalTasks" as const, id })),
        ]);
        await commitGoalWrites([], "goals", [
          { name: "goals", id: removed.id },
        ]);
        return removed;
      }
    }
    const taskMatch = path.match(/^\/tasks\/([^/]+)(?:\/(complete|reopen))?$/);
    if (taskMatch) {
      let task: GoalTask | undefined;
      try {
        task = (await getDoc(doc(db, "goalTasks", taskMatch[1]))).data() as
          GoalTask | undefined;
      } catch {
        task = undefined; // Missing and foreign tasks both read as not found.
      }
      if (!task) throw new Error("Task not found.");
      const app = service(await goalState(uid, task.goalId));
      if (taskMatch[2] === "complete" && method === "POST") {
        const changed = app.completeTask(uid, task.id, input?.cascade === true);
        await commitGoalWrites(changed, "goalTasks");
        return changed;
      }
      if (taskMatch[2] === "reopen" && method === "POST") {
        const changed = app.reopenTask(uid, task.id);
        await commitGoalWrites(changed, "goalTasks");
        return changed;
      }
      if (!taskMatch[2] && method === "PATCH") {
        const updated = app.updateTask(uid, task.id, input);
        await commitGoalWrites([updated], "goalTasks");
        return updated;
      }
      if (!taskMatch[2] && method === "DELETE") {
        const removed = app.deleteTask(uid, task.id);
        await commitGoalWrites(
          [],
          "goalTasks",
          removed.ids.map((id) => ({ name: "goalTasks" as const, id })),
        );
        return removed;
      }
    }
    throw new Error("Not found.");
  }
  async function handle(path: string, method: string, input: any) {
    if (path === "/health")
      return { ok: true, demo: false, backend: "firebase" };
    await auth.authStateReady();
    if (path === "/auth/logout" && method === "POST") {
      await signOut(auth);
      return { ok: true };
    }
    if (path === "/auth/google" && method === "POST") {
      if (!googleSignIn)
        throw new Error("Google sign-in is not available on this platform.");
      await googleSignIn();
      await ensureProfile();
      return { token: await auth.currentUser!.getIdToken() };
    }
    if (["/auth/login", "/auth/register"].includes(path) && method === "POST") {
      const email = loginEmail(String(input.email ?? ""));
      if (
        typeof input.password !== "string" ||
        !input.password ||
        input.password.length > 200
      )
        throw new Error("Enter your password (up to 200 characters).");
      if (path === "/auth/register") {
        const name = String(input.name ?? "").trim();
        if (!name || name.length > 60)
          throw new Error("Enter a name of 1–60 characters.");
        if (input.password.length < 6)
          throw new Error("Use a password with at least 6 characters.");
        const handle = email.split("@")[0];
        if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(handle))
          throw new Error(
            "Use a username of 3–40 letters, numbers, dots, underscores or hyphens.",
          );
        if ((await getDoc(doc(db, "usernames", handle))).exists())
          throw new Error("This username is taken. Choose another username.");
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          input.password,
        );
        try {
          await updateProfile(result.user, { displayName: name });
          await ensureProfile(handle);
        } catch (error) {
          await deleteUser(result.user);
          throw error;
        }
      } else await signInWithEmailAndPassword(auth, email, input.password);
      await ensureProfile();
      return { token: await auth.currentUser!.getIdToken() };
    }
    const uid = id();
    if (path === "/bootstrap" && method === "GET") return load();
    if (/^\/(goals|tasks)(\/|$)/.test(path))
      return goals(uid, path, method, input);
    const url = new URL(path, "https://rabbit.local");
    if (url.pathname === "/search" && method === "GET") return search(uid, url);
    const state = await load();
    const service = createService(state, undefined, newId);
    if (url.pathname === "/users" && method === "GET")
      return service.findUsers(uid, url.searchParams.get("q") ?? "");
    if (path === "/friends/requests" && method === "POST") {
      const recipientId = input.recipientId;
      // Read both directions so simultaneous opposite requests conflict and retry.
      const ref = doc(db, "friendRequests", `${uid}:${recipientId}`);
      const reverse = doc(db, "friendRequests", `${recipientId}:${uid}`);
      return runTransaction(db, async (tx) => {
        const snapshots = await Promise.all([tx.get(ref), tx.get(reverse)]);
        const latest = createService({
          ...state,
          friendRequests: snapshots
            .filter((d) => d.exists())
            .map((d) => d.data() as FriendRequest),
        });
        const request = latest.sendFriendRequest(uid, recipientId);
        tx.set(ref, request);
        return request;
      });
    }
    const friendMatch = url.pathname.match(/^\/friends\/requests\/([^/]+)$/);
    if (friendMatch && method === "PATCH") {
      const ref = doc(db, "friendRequests", decodeURIComponent(friendMatch[1]));
      return runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists()) throw new Error("Friend request not found.");
        const latest = createService({
          ...state,
          friendRequests: [snapshot.data() as FriendRequest],
        });
        const request = latest.respondToFriendRequest(
          uid,
          snapshot.id,
          input.status,
        );
        if (request.status === "accepted") {
          const refs = [request.senderId, request.recipientId].map((id) =>
            doc(db, "friendLists", id),
          );
          const lists = await Promise.all(refs.map((ref) => tx.get(ref)));
          refs.forEach((ref, i) =>
            tx.set(ref, {
              ids: [
                ...new Set([
                  ...(lists[i].data()?.ids ?? []),
                  i === 0 ? request.recipientId : request.senderId,
                ]),
              ],
              requestId: request.id,
            }),
          );
        }
        tx.update(ref, { status: request.status });
        return request;
      });
    }
    if (path === "/posts" && method === "POST") {
      const post = service.createPost(uid, input as PostInput);
      await setDoc(doc(db, "posts", post.id), clean(post));
      return post;
    }
    if (path === "/groups" && method === "POST") {
      const group = service.createGroup(uid, input);
      await setDoc(doc(db, "groups", group.id), group);
      return group;
    }
    if (path === "/profile" && method === "PATCH") {
      const profile = service.updateProfile(uid, input);
      await setDoc(doc(db, "users", uid), clean(profile));
      return profile;
    }
    const groupMatch = path.match(/^\/groups\/([^/]+)\/members$/);
    if (groupMatch && method === "POST") {
      const ref = doc(db, "groups", groupMatch[1]);
      return runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists()) throw new Error("Circle not found.");
        const latest = createService({
          ...state,
          groups: [snapshot.data() as Group],
        });
        const group = latest.addMembers(uid, snapshot.id, input.memberIds);
        tx.update(ref, { memberIds: arrayUnion(...group.memberIds) });
        return group;
      });
    }
    const postMatch = path.match(
      /^\/posts\/([^/]+)\/(save|vote|outdated|comments)$/,
    );
    if (postMatch && method === "POST") {
      const ref = doc(db, "posts", postMatch[1]);
      return runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists())
          throw new Error("You do not have access to this post.");
        const latest = createService(
          { ...state, posts: [snapshot.data() as Post] },
          undefined,
          newId,
        );
        const post =
          postMatch[2] === "save"
            ? latest.toggleSave(uid, snapshot.id)
            : postMatch[2] === "vote"
              ? latest.toggleVote(uid, snapshot.id)
              : postMatch[2] === "outdated"
                ? latest.toggleOutdated(uid, snapshot.id)
                : latest.addComment(uid, snapshot.id, input.body);
        if (postMatch[2] === "comments") {
          tx.update(ref, { comments: arrayUnion(post.comments.at(-1)!) });
        } else {
          const field =
            postMatch[2] === "save"
              ? "savedBy"
              : postMatch[2] === "outdated"
                ? "outdatedBy"
                : "votes";
          tx.update(ref, {
            [field]: (post[field] ?? []).includes(uid)
              ? arrayUnion(uid)
              : arrayRemove(uid),
          });
        }
        return post;
      });
    }
    throw new Error("Not found.");
  }
  return {
    async request<T = unknown>(
      path: string,
      method = "GET",
      input: unknown = {},
    ): Promise<T> {
      try {
        return (await handle(path, method, input)) as T;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code && authMessages[code]) throw new Error(authMessages[code]);
        throw error;
      }
    },
  };
}

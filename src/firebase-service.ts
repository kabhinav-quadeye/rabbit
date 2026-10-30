import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  setDoc,
  arrayUnion,
  arrayRemove,
  type Firestore,
} from "firebase/firestore";
import { createService } from "./domain.ts";
import { loginEmail } from "./identity.ts";
import type {
  State,
  User,
  Post,
  Group,
  Bootstrap,
  PostInput,
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
  async function ensureProfile() {
    const uid = id(),
      account = auth.currentUser!;
    const ref = doc(db, "users", uid);
    await runTransaction(db, async (tx) => {
      const current = await tx.get(ref);
      if (current.exists()) return;
      const handle =
        account.email?.split("@")[0] ?? `reader-${uid.slice(0, 8)}`;
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
    const [users, groups] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(
        query(
          collection(db, "groups"),
          where("memberIds", "array-contains", uid),
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
    };
    const space = createService(state).bootstrap(uid);
    space.currentUser.email = auth.currentUser!.email ?? undefined;
    return space;
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
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          input.password,
        );
        await updateProfile(result.user, { displayName: name });
      } else await signInWithEmailAndPassword(auth, email, input.password);
      await ensureProfile();
      return { token: await auth.currentUser!.getIdToken() };
    }
    const uid = id();
    if (path === "/bootstrap" && method === "GET") return load();
    const url = new URL(path, "https://rabbit.local");
    const state = await load();
    const service = createService(state, undefined, newId);
    if (url.pathname === "/search" && method === "GET")
      return service.search(
        uid,
        url.searchParams.get("q") ?? "",
        url.searchParams.get("scope") ?? "all",
      );
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
        if (!snapshot.exists()) throw new Error("Group not found.");
        const latest = createService({
          ...state,
          groups: [snapshot.data() as Group],
        });
        const group = latest.addMembers(uid, snapshot.id, input.memberIds);
        tx.update(ref, { memberIds: arrayUnion(...group.memberIds) });
        return group;
      });
    }
    const postMatch = path.match(/^\/posts\/([^/]+)\/(save|vote|comments)$/);
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
              : latest.addComment(uid, snapshot.id, input.body);
        if (postMatch[2] === "comments") {
          tx.update(ref, { comments: arrayUnion(post.comments.at(-1)!) });
        } else {
          const field = postMatch[2] === "save" ? "savedBy" : "votes";
          tx.update(ref, {
            [field]: post[field].includes(uid)
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

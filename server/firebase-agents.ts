import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { AppError } from "../src/domain.ts";
import { agentRequest, agentOwner, handleAgents, hashToken } from "./agents.ts";
import type { State, User, Group, Post } from "../src/types.ts";
import type { AgentAccount } from "../src/agent-types.ts";

export function createFirebaseAgentGateway() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    (process.env.FIRESTORE_EMULATOR_HOST ? "demo-rabbit-friends" : undefined);
  if (!projectId)
    throw new Error("Set FIREBASE_PROJECT_ID for the Rabbit agent gateway.");
  const app =
    getApps().find((a) => a.name === "rabbit-agent-gateway") ??
    initializeApp(
      {
        projectId,
        ...(process.env.FIRESTORE_EMULATOR_HOST
          ? {}
          : { credential: applicationDefault() }),
      },
      "rabbit-agent-gateway",
    );
  const db = getFirestore(app),
    auth = getAuth(app);
  return async (
    path: string,
    method: string,
    input: unknown,
    token: string,
  ) => {
    let owner: string;
    try {
      if (agentRequest(path)) {
        const found = await db
          .collection("agentAccounts")
          .where("tokenHashes", "array-contains", hashToken(token))
          .limit(1)
          .get();
        if (found.empty) throw new Error("Invalid agent token");
        owner = found.docs[0].id;
      } else owner = (await auth.verifyIdToken(token, true)).uid;
      if ((await auth.getUser(owner)).disabled)
        throw new Error("Disabled account");
    } catch {
      throw new AppError(
        "Your credential is invalid or expired. Sign in or create a new token.",
        401,
      );
    }
    const result = await db.runTransaction(async (tx) => {
      const ref = db.doc(`agentAccounts/${owner}`);
      const account = await tx.get(ref);
      const agentAccount = account.data() as AgentAccount | undefined;
      if (agentRequest(path))
        agentOwner(
          {
            users: [],
            groups: [],
            posts: [],
            agentAccounts: agentAccount ? [agentAccount] : [],
          },
          token,
        );
      const search = path === "/api/agent/search";
      const postId =
        path.match(/^\/api\/agent\/posts\/([^/]+)/)?.[1] ??
        agentAccount?.drafts.find(
          (d) =>
            d.id ===
            path.match(/^\/api\/agents\/drafts\/([^/]+)\/publish$/)?.[1],
        )?.postId;
      const users: User[] = search
        ? (await tx.get(db.collection("users"))).docs.map(
            (d) => d.data() as User,
          )
        : [(await tx.get(db.doc(`users/${owner}`))).data() as User].filter(
            Boolean,
          );
      let posts: Post[] = [],
        groups: Group[] = [];
      if (search) {
        groups = (
          await tx.get(
            db.collection("groups").where("memberIds", "array-contains", owner),
          )
        ).docs.map((d) => d.data() as Group);
        const queries = [
          db.collection("posts").where("authorId", "==", owner),
          db
            .collection("posts")
            .where("audienceType", "==", "user")
            .where("audienceId", "==", owner),
          ...groups.map((g) =>
            db
              .collection("posts")
              .where("audienceType", "==", "group")
              .where("audienceId", "==", g.id),
          ),
        ];
        const snapshots = await Promise.all(queries.map((q) => tx.get(q)));
        posts = [
          ...new Map(
            snapshots.flatMap((s) =>
              s.docs.map((d) => [d.id, d.data() as Post] as const),
            ),
          ).values(),
        ];
      } else if (postId) {
        const post = (await tx.get(db.doc(`posts/${postId}`))).data() as
          Post | undefined;
        if (post) {
          posts = [post];
          if (post.audienceType === "group") {
            const group = (
              await tx.get(db.doc(`groups/${post.audienceId}`))
            ).data() as Group | undefined;
            if (group) groups = [group];
          }
        }
      }
      const state: State = {
        users,
        groups,
        posts,
        agentAccounts: agentAccount ? [agentAccount] : [],
      };
      if (agentRequest(path)) agentOwner(state, token);
      const next = structuredClone(state);
      try {
        const data = handleAgents(next, owner, path, method, input, token);
        const updated = next.agentAccounts![0];
        const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
        tx.set(
          ref,
          clean({
            ...updated,
            tokenHashes: updated.connections.map((c) => c.hash),
          }),
        );
        for (const post of next.posts) {
          const previous = state.posts.find((p) => p.id === post.id);
          if (JSON.stringify(previous) !== JSON.stringify(post))
            tx.set(db.doc(`posts/${post.id}`), clean(post));
        }
        return { data };
      } catch (error) {
        // Persist only the request budget on rejection, never a partial write.
        const updated = next.agentAccounts?.[0];
        if (updated && account.exists)
          tx.update(ref, {
            requests: updated.requests,
            windowStart: updated.windowStart,
          });
        if (error instanceof AppError)
          return { error: { message: error.message, status: error.status } };
        throw error;
      }
    });
    if (result.error)
      throw new AppError(result.error.message, result.error.status);
    return result.data;
  };
}

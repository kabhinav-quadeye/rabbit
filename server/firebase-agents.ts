import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { AppError, createService } from "../src/domain.ts";
import type { Group, Post, State, User } from "../src/types.ts";
import {
  checkCredential,
  connectionInfo,
  executeOperation,
  useCredential,
  type AgentStore,
  type Credential,
} from "./agents.ts";

export function firebaseAgentStore(projectId: string): AgentStore {
  const name = `rabbit-agents-${projectId}`;
  const app =
    getApps().find((app) => app.name === name) ??
    initializeApp({ projectId }, name);
  const db = getFirestore(app);
  const credentials = db.collection("agentCredentials");
  const byOwner = (ownerId: string) =>
    credentials.where("ownerId", "==", ownerId);
  async function getCredential(tx: Transaction, hash: string) {
    const snapshot = await tx.get(credentials.doc(hash));
    const credential = snapshot.exists
      ? (snapshot.data() as Credential)
      : undefined;
    checkCredential(credential);
    return credential;
  }
  return {
    async verifyOwner(token) {
      try {
        return (await getAuth(app).verifyIdToken(token, true)).uid;
      } catch {
        throw new AppError(
          "Your session has ended. Please sign in again.",
          401,
        );
      }
    },
    async list(ownerId) {
      const snapshot = await byOwner(ownerId).get();
      return snapshot.docs
        .map((doc) => connectionInfo(doc.data() as Credential))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async create(credential) {
      await db.runTransaction(async (tx) => {
        // Serialize connection creation per account, including when there are no credentials yet.
        const guard = db.collection("agentOwners").doc(credential.ownerId);
        await tx.get(guard);
        const [profile, snapshot] = await Promise.all([
          tx.get(db.collection("users").doc(credential.ownerId)),
          tx.get(byOwner(credential.ownerId)),
        ]);
        if (!profile.exists)
          throw new AppError(
            "Open your Rabbit profile before connecting an agent.",
          );
        const active = snapshot.docs.filter(
          (d) =>
            !d.data().revokedAt && Date.parse(d.data().expiresAt) > Date.now(),
        );
        if (active.length >= 10)
          throw new AppError(
            "Revoke an existing connection before creating another (maximum 10).",
          );
        tx.set(guard, {
          updatedAt: credential.createdAt,
          connectionId: credential.id,
        });
        tx.create(credentials.doc(credential.hash), credential);
      });
    },
    async revoke(ownerId, connectionId) {
      const snapshot = await byOwner(ownerId)
        .where("id", "==", connectionId)
        .get();
      if (snapshot.empty)
        throw new AppError("Agent connection not found.", 404);
      await snapshot.docs[0].ref.update({
        revokedAt: new Date().toISOString(),
      });
    },
    async authorize(hash) {
      await db.runTransaction(async (tx) => {
        const next = useCredential(await getCredential(tx, hash));
        try {
          const account = await getAuth(app).getUser(next.ownerId);
          if (account.disabled) throw new Error("disabled");
        } catch {
          throw new AppError(
            "The connected account is no longer available.",
            401,
          );
        }
        tx.set(credentials.doc(hash), next);
      });
    },
    async execute(hash, operation) {
      return db.runTransaction(async (tx) => {
        const credential = await getCredential(tx, hash);
        const uid = credential.ownerId;
        const [profile, groups] = await Promise.all([
          tx.get(db.collection("users").doc(uid)),
          tx.get(
            db.collection("groups").where("memberIds", "array-contains", uid),
          ),
        ]);
        if (!profile.exists)
          throw new AppError(
            "The connected account is no longer available.",
            401,
          );
        const circles = groups.docs.map((d) => d.data() as Group);
        const postCollection = db.collection("posts");
        const snapshots =
          operation.kind === "search"
            ? await Promise.all([
                tx.get(postCollection.where("authorId", "==", uid)),
                tx.get(
                  postCollection
                    .where("audienceType", "==", "user")
                    .where("audienceId", "==", uid),
                ),
                ...circles.map((g) =>
                  tx.get(
                    postCollection
                      .where("audienceType", "==", "group")
                      .where("audienceId", "==", g.id),
                  ),
                ),
              ])
            : [];
        const single =
          operation.kind !== "search"
            ? await tx.get(postCollection.doc(operation.postId))
            : null;
        const posts = [
          ...new Map([
            ...snapshots.flatMap((s) =>
              s.docs.map((d) => [d.id, d.data() as Post] as const),
            ),
            ...(single?.exists
              ? [[single.id, single.data() as Post] as const]
              : []),
          ]).values(),
        ];
        const authorIds = [...new Set(posts.map((p) => p.authorId))];
        const authors = await Promise.all(
          authorIds
            .filter((id) => id !== uid)
            .map((id) => tx.get(db.collection("users").doc(id))),
        );
        const state: State = {
          users: [
            profile.data() as User,
            ...authors.filter((d) => d.exists).map((d) => d.data() as User),
          ],
          groups: circles,
          posts,
        };
        const service = createService(state);
        const result = executeOperation(service, credential, operation);
        if (operation.kind === "feedback") {
          const next = service.readPost(uid, operation.postId);
          const field =
            operation.feedback === "useful" ? "votes" : "outdatedBy";
          const via =
            operation.feedback === "useful" ? "usefulVia" : "outdatedVia";
          tx.update(postCollection.doc(operation.postId), {
            [field]: next[field],
            [via]: next[via] ?? {},
          });
        }
        // Revocation, membership and latest post were all read inside this transaction.
        tx.set(credentials.doc(hash), credential);
        return result;
      });
    },
  };
}

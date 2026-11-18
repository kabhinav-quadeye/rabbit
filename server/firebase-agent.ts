import {
  deleteApp as deleteAdmin,
  initializeApp as initializeAdmin,
} from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { deleteApp, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { createFirebaseService } from "../src/firebase-service.ts";
import { AppError } from "./domain.ts";
import type { AgentTools } from "./mcp.ts";

export function createFirebaseAgent(config: FirebaseOptions) {
  const admin = initializeAdmin(
    { projectId: config.projectId },
    crypto.randomUUID(),
  );
  const auth = adminAuth(admin);
  return {
    close: () => deleteAdmin(admin),
    async authenticate(authorization?: string) {
      try {
        const bearer = authorization?.match(/^Bearer (\S+)$/)?.[1];
        if (!bearer) throw new Error();
        const identity = await auth.verifyIdToken(bearer, true);
        if (identity.rabbitAgent === true) throw new Error();
        return identity.uid;
      } catch {
        throw new AppError("Sign in to manage agent access.", 401);
      }
    },
    actions(uid: string): AgentTools {
      const use = async <T>(
        action: (
          service: ReturnType<typeof createFirebaseService>,
        ) => Promise<T>,
      ) => {
        // The Firebase client authenticates with a scoped identity so every
        // read and write still passes through Firestore rules.
        const account = await auth.getUser(uid);
        if (account.disabled)
          throw new AppError("This Rabbit account is disabled.", 403);
        const app = initializeApp(config, crypto.randomUUID());
        try {
          const client = getAuth(app);
          const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
          if (authHost)
            connectAuthEmulator(client, `http://${authHost}`, {
              disableWarnings: true,
            });
          const db = getFirestore(app);
          const dbHost = process.env.FIRESTORE_EMULATOR_HOST;
          if (dbHost) {
            const address = new URL(`http://${dbHost}`);
            connectFirestoreEmulator(
              db,
              address.hostname,
              Number(address.port),
            );
          }
          const key = await auth.createCustomToken(uid, { rabbitAgent: true });
          await signInWithCustomToken(client, key);
          return await action(createFirebaseService(client, db));
        } finally {
          await deleteApp(app);
        }
      };
      return {
        search: (query) =>
          use((service) =>
            service.request(`/search?q=${encodeURIComponent(query)}`),
          ),
        goals: () => use((service) => service.request("/goals")),
        propose: (kind, input) =>
          use((service) => service.queueAgentProposal(kind, input)),
      };
    },
  };
}

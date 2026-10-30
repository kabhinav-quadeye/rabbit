import type { FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Auth, Persistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase exposes this function in its React Native entry point. TypeScript's
// web resolution does not include that platform-specific export.
const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};
export function initializeRabbitAuth(app: FirebaseApp) {
  try {
    return FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/already-initialized")
      return FirebaseAuth.getAuth(app);
    throw error;
  }
}
export async function googleSignIn(_auth: Auth): Promise<never> {
  throw new Error(
    "Use Rabbit in your browser for Google sign-in. Native Google sign-in requires platform OAuth credentials.",
  );
}

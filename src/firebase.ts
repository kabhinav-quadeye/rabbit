import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { createFirebaseService } from "./firebase-service";
import { initializeRabbitAuth, googleSignIn } from "./firebase-platform";

export const firebaseEnabled =
  !!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.EXPO_PUBLIC_BACKEND !== "local";
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const app = firebaseEnabled
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;
export const firebaseAuth = app ? initializeRabbitAuth(app) : null;
export const firebaseService =
  app && firebaseAuth
    ? createFirebaseService(
        firebaseAuth,
        initializeFirestore(app, { experimentalAutoDetectLongPolling: true }),
        () => googleSignIn(firebaseAuth),
      )
    : null;

import type { FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";

export const initializeRabbitAuth = (app: FirebaseApp) => getAuth(app);
export const googleSignIn = (auth: Auth) =>
  signInWithPopup(auth, new GoogleAuthProvider());

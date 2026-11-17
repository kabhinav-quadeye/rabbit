import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type { Bootstrap, Post } from "./types";
import { firebaseAuth, firebaseService } from "./firebase";
export { firebaseEnabled } from "./firebase";
const nativeHost = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
export const apiBase =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web" ? "" : `http://${nativeHost}:3001`);
let token: string | null = null;
export async function setToken(next: string | null) {
  if (firebaseAuth) return;
  token = next;
  if (Platform.OS === "web") {
    if (next) localStorage.setItem("rabbit.session", next);
    else localStorage.removeItem("rabbit.session");
  } else {
    if (next) await SecureStore.setItemAsync("rabbit.session", next);
    else await SecureStore.deleteItemAsync("rabbit.session");
  }
}
export async function restoreToken() {
  if (firebaseAuth) {
    await firebaseAuth.authStateReady();
    return firebaseAuth.currentUser?.getIdToken() ?? null;
  }
  token =
    Platform.OS === "web"
      ? localStorage.getItem("rabbit.session")
      : await SecureStore.getItemAsync("rabbit.session");
  return token;
}
export async function request<T = unknown>(
  path: string,
  method = "GET",
  input?: unknown,
): Promise<T> {
  const gateway = /^\/agents(?:\/|$)/.test(path);
  if (firebaseService && !gateway)
    return firebaseService.request<T>(path, method, input);
  const credential = firebaseAuth
    ? await firebaseAuth.currentUser?.getIdToken()
    : token;
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
  } catch {
    throw new Error(
      "Couldn’t connect to Rabbit. Check your connection and try again.",
    );
  }
  const result = await response
    .json()
    .catch(() => ({ error: "Rabbit is reconnecting. Please try again." }));
  if (!response.ok)
    throw new Error(result.error ?? "Something went wrong. Please try again.");
  return result as T;
}
export const loadSpace = () => request<Bootstrap>("/bootstrap");
export const searchPosts = (query: string, scope: string) =>
  request<Post[]>(
    `/search?q=${encodeURIComponent(query)}&scope=${encodeURIComponent(scope)}`,
  );

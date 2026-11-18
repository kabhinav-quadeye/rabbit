import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type { Bootstrap, Post } from "./types";
import { firebaseAuth, firebaseService } from "./firebase";
export { firebaseEnabled } from "./firebase";
const nativeHost = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
const base =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web" ? "" : `http://${nativeHost}:3001`);
const gateway = firebaseService ? process.env.EXPO_PUBLIC_AGENT_URL : base;
export const agentEndpoint =
  gateway === undefined
    ? null
    : `${gateway.replace(/\/$/, "") || globalThis.location?.origin || ""}/api/mcp`;
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
  const connection = path === "/agent/connection";
  if (firebaseService && !connection)
    return firebaseService.request<T>(path, method, input);
  const bearer = firebaseAuth
    ? await firebaseAuth.currentUser?.getIdToken()
    : token;
  const host = connection ? gateway : base;
  if (host === undefined) throw new Error("Agent access isn’t configured.");

  let response: Response;
  try {
    response = await fetch(`${host.replace(/\/$/, "")}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
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

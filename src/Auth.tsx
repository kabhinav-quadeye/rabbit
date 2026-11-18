import React, { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import { Brand, Action, Field, Privacy } from "./ui";
import { colors as c, fonts, s } from "./theme";
import { firebaseEnabled } from "./api";
export function Auth({
  onAuth,
  onDemo,
  demoEnabled,
  error: initialError = "",
}: {
  onAuth: (mode: string, input: any) => Promise<void>;
  onDemo: () => Promise<void>;
  demoEnabled: boolean;
  error?: string;
}) {
  const [mode, setMode] = useState("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onAuth(mode, { name, email, password });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function googleSignIn() {
    setBusy(true);
    setError("");
    try {
      await onAuth("google", {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        backgroundColor: c.bg,
      }}
    >
      <View style={{ width: "100%", maxWidth: 420, gap: 28 }}>
        <Brand />
        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 34,
              lineHeight: 42,
              color: c.ink,
              letterSpacing: -1,
            }}
          >
            {mode === "register"
              ? "Your people.\nYour little corner."
              : "Good to have\nyou back."}
          </Text>
          <Text style={[s.text, { color: c.muted }]}>
            {mode === "register"
              ? "A private space for useful things and the people you want to share them with."
              : "Sign in to pick up your thoughts and conversations."}
          </Text>
        </View>
        <View style={{ gap: 18 }}>
          {mode === "register" && (
            <Field
              label="Your name"
              accessibilityLabel="Your name"
              placeholder="Alex Morgan"
              value={name}
              onChangeText={setName}
              maxLength={60}
            />
          )}
          <Field
            label={mode === "register" ? "Username" : "Username or email"}
            accessibilityLabel={
              mode === "register" ? "Username" : "Username or email"
            }
            placeholder={
              mode === "register"
                ? "your.username"
                : "your.username or you@example.com"
            }
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={mode === "register" ? "default" : "email-address"}
            value={email}
            onChangeText={setEmail}
          />
          {mode === "register" && (
            <Text style={s.small}>
              Your unique username helps friends find you. Use 3–40 letters,
              numbers, dots, underscores or hyphens.
            </Text>
          )}
          <Field
            label="Password"
            accessibilityLabel="Password"
            placeholder={
              mode === "login"
                ? "Your password"
                : firebaseEnabled
                  ? "At least 6 characters"
                  : "At least 8 characters"
            }
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Action
            label={mode === "register" ? "Create account" : "Sign in"}
            onPress={submit}
            loading={busy}
            disabled={
              !email.trim() ||
              busy ||
              password.length <
                (mode === "login" ? 1 : firebaseEnabled ? 6 : 8) ||
              (mode === "register" && !name.trim())
            }
            icon={ArrowRight}
          >
            {mode === "register" ? "Create your space" : "Sign in"}
          </Action>
          {firebaseEnabled && Platform.OS === "web" && (
            <Action
              secondary
              onPress={googleSignIn}
              disabled={busy}
              label="Continue with Google"
            >
              Continue with Google
            </Action>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            style={{ minHeight: 36, justifyContent: "center" }}
          >
            <Text
              style={[
                s.text,
                { textAlign: "center", fontSize: 13, color: c.green },
              ]}
            >
              {mode === "login"
                ? "New here? Create an account"
                : "Already have a space? Sign in"}
            </Text>
          </Pressable>
          {demoEnabled && (
            <Action
              secondary
              onPress={async () => {
                setError("");
                setBusy(true);
                try {
                  await onDemo();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Explore the demo
            </Action>
          )}
        </View>
        <Privacy />
      </View>
    </View>
  );
}

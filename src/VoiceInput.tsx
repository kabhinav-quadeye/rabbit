import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Mic from "lucide-react-native/icons/mic";
import Square from "lucide-react-native/icons/square";
import { speech } from "./speech";
import { colors as c, fonts, s } from "./theme";

type Phase = "idle" | "starting" | "listening" | "stopping";
const sessionSeconds = 60;
const barHeights = [
  8, 14, 20, 14, 27, 34, 22, 38, 48, 31, 41, 30, 22, 31, 20, 13, 18, 12, 8,
];
const unavailable =
  "Dictation isn’t available here. You can still type your post.";
function errorMessage(code: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Allow microphone and speech recognition in your browser or device settings, then try again. You can also keep typing.";
    case "network":
      return "Dictation lost its connection. Check your connection and try again. Your draft is safe.";
    case "no-speech":
    case "speech-timeout":
      return "No speech was captured. Try again and speak near the microphone, or keep typing.";
    case "language-not-supported":
      return "English dictation isn’t supported by your speech service. You can still type your post.";
    default:
      return "Dictation couldn’t finish. Try again or keep typing. Your draft is safe.";
  }
}

export function VoiceInput({
  onText,
  onActiveChange,
  disabled,
  full,
}: {
  onText: (text: string) => void;
  onActiveChange: (active: boolean) => void;
  disabled: boolean;
  full: boolean;
}) {
  const available = !!speech?.isRecognitionAvailable();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [interim, setInterim] = useState("");
  const [lastPhrase, setLastPhrase] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const current = useRef<Phase>("idle");
  const alive = useRef(true);
  const received = useRef(false);
  const failed = useRef(false);
  const callbacks = useRef({ onText, onActiveChange });
  callbacks.current = { onText, onActiveChange };

  function transition(next: Phase) {
    current.current = next;
    setPhase(next);
    callbacks.current.onActiveChange(next !== "idle");
  }
  function interrupt(message: string) {
    if (current.current === "idle") return;
    transition("idle");
    setInterim("");
    setMessage(message);
    speech?.abort();
  }
  useEffect(() => {
    alive.current = true;
    const listeners = speech
      ? [
          speech.addListener("start", () => {
            if (alive.current && (current.current as string) === "starting")
              transition("listening");
          }),
          speech.addListener("speechstart", () => {
            if (current.current === "listening") setSpeaking(true);
          }),
          speech.addListener("speechend", () => {
            setSpeaking(false);
            setVolume(0);
          }),
          speech.addListener("audioend", () => {
            if (current.current === "listening") transition("stopping");
          }),
          speech.addListener("result", (event) => {
            if (
              !alive.current ||
              !["listening", "stopping"].includes(current.current) ||
              failed.current
            )
              return;
            const text = event.results[0]?.transcript.trim();
            if (!text) return;
            if (event.isFinal) {
              received.current = true;
              setInterim("");
              setLastPhrase(text);
              callbacks.current.onText(text);
            } else {
              setInterim(text);
            }
          }),
          speech.addListener("error", (event) => {
            if (!alive.current || current.current === "idle") return;
            failed.current = true;
            setInterim("");
            setError(errorMessage(event.error));
            // Wait for end before another session can start.
            transition("stopping");
          }),
          speech.addListener("end", () => {
            if (!alive.current || current.current === "idle") return;
            setInterim("");
            if (!failed.current && !received.current)
              setError(errorMessage("no-speech"));
            else if (!failed.current)
              setMessage("Dictation added to your draft.");
            transition("idle");
          }),
        ]
      : [];
    if (speech && Platform.OS !== "web") {
      listeners.push(
        speech.addListener("volumechange", ({ value }) => {
          if (current.current === "listening")
            setVolume(Math.round(Math.max(0, Math.min(value, 10))) / 10);
        }),
      );
    }
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active")
        interrupt(
          "Dictation stopped while you were away. Review your draft or dictate again.",
        );
    });
    function hidden() {
      if (document.hidden)
        interrupt(
          "Dictation stopped while you were away. Review your draft or dictate again.",
        );
    }
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", hidden);
    return () => {
      alive.current = false;
      listeners.forEach((listener) => listener.remove());
      appState.remove();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", hidden);
      if (current.current !== "idle") speech?.abort();
    };
  }, []);

  useEffect(() => {
    if (full)
      interrupt(
        "Your post reached the 20,000-character limit. Shorten the text to dictate more.",
      );
  }, [full]);
  useEffect(() => {
    if (phase === "idle") return;
    const timer = setTimeout(
      () => {
        if (phase === "listening") {
          stop();
        } else {
          interrupt(
            "Dictation timed out. Your draft is safe. Try again or keep typing.",
          );
        }
      },
      phase === "listening" ? sessionSeconds * 1000 : 15_000,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "listening") return;
    const started = Date.now();
    const timer = setInterval(
      () =>
        setElapsed(
          Math.min(sessionSeconds, Math.floor((Date.now() - started) / 1000)),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);

  async function start() {
    if (!available || disabled || full || current.current !== "idle") return;
    received.current = false;
    failed.current = false;
    setError("");
    setMessage("");
    setInterim("");
    setLastPhrase("");
    setSpeaking(false);
    setVolume(0);
    setElapsed(0);
    Keyboard.dismiss();
    transition("starting");
    try {
      // Web requests permission in start(), preserving the browser user gesture.
      if (Platform.OS !== "web") {
        const permission = await speech!.requestPermissionsAsync();
        if (!alive.current || (current.current as string) !== "starting")
          return;
        if (!permission.granted) {
          setError(errorMessage("not-allowed"));
          transition("idle");
          return;
        }
      }
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      speech!.start({
        lang: /^en(?:-|$)/i.test(locale) ? locale : "en-US",
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        addsPunctuation: true,
        recordingOptions: { persist: false },
        ...(Platform.OS !== "web" && {
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        }),
      });
    } catch {
      if (!alive.current || current.current === "idle") return;
      setError(errorMessage("unknown"));
      transition("idle");
      speech?.abort();
    }
  }
  function stop() {
    if (current.current !== "listening") return;
    transition("stopping");
    try {
      speech?.stop();
    } catch {
      interrupt("Dictation couldn’t finish. Review your draft and try again.");
    }
  }
  const active = phase !== "idle";
  const locked =
    disabled ||
    full ||
    !available ||
    phase === "starting" ||
    phase === "stopping";
  const Glyph = active ? Square : Mic;
  const listening = phase === "listening";
  const status = listening
    ? "Listening…"
    : phase === "starting"
      ? "Starting dictation…"
      : phase === "stopping"
        ? "Finishing dictation…"
        : "Post content";
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const level = listening ? Math.max(volume, speaking ? 0.65 : 0.18) : 0.1;
  const preview = interim || lastPhrase;
  return (
    <View style={styles.region}>
      <View style={active && styles.panel}>
        <View style={[styles.header, active && styles.activeHeader]}>
          <View style={styles.status}>
            <View role="status" accessibilityLiveRegion="polite">
              <Text style={active ? styles.activeTitle : s.label}>
                {status}
              </Text>
              {listening && speaking && (
                <Text style={styles.activeDetail}>Speech detected</Text>
              )}
            </View>
            {active && (
              <Text style={styles.activeDetail}>English · {elapsedLabel}</Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              active ? "Stop dictation" : "Dictate post content"
            }
            accessibilityState={{
              disabled: locked,
              busy: active && !listening,
            }}
            disabled={locked}
            onPress={active ? stop : start}
            style={({ hovered, pressed }: any) => [
              styles.button,
              {
                backgroundColor: active
                  ? hovered || pressed
                    ? c.greenLight
                    : c.paper
                  : hovered || pressed
                    ? c.sage
                    : c.greenLight,
                opacity: locked ? 0.55 : 1,
              },
            ]}
          >
            <Glyph size={15} color={c.green} strokeWidth={1.8} />
            <Text style={styles.buttonLabel}>
              {active ? "Stop" : "Dictate"}
            </Text>
          </Pressable>
        </View>
        {active && (
          <>
            <View aria-hidden style={styles.waveform}>
              {barHeights.map((height, index) => (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    {
                      height: 4 + height * level,
                      opacity: 0.55 + level * 0.45,
                    },
                  ]}
                />
              ))}
            </View>
            <Text
              numberOfLines={4}
              style={preview ? styles.transcript : styles.prompt}
            >
              {preview ||
                (listening
                  ? "Speak naturally. Your words will appear here."
                  : phase === "starting"
                    ? "Waiting for the microphone…"
                    : error
                      ? "Closing the microphone…"
                      : "Adding your last words to the draft…")}
            </Text>
          </>
        )}
      </View>
      {!active && (
        <Text role="status" accessibilityLiveRegion="polite" style={s.small}>
          {!available
            ? unavailable
            : full
              ? "Shorten your post to dictate more."
              : message ||
                "Dictate in English. Your speech service may process audio. Rabbit saves only text."}
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  region: { gap: 6, marginBottom: 12 },
  panel: { backgroundColor: c.green, borderRadius: 12, padding: 16 },
  header: { ...s.between, gap: 12 },
  activeHeader: { minHeight: 62, alignItems: "flex-start" },
  status: { flex: 1, gap: 2 },
  activeTitle: { ...s.h2, color: c.paper },
  activeDetail: { ...s.small, color: c.greenLight },
  button: {
    ...s.row,
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 9,
  },
  buttonLabel: { ...s.label, color: c.green },
  waveform: {
    ...s.row,
    justifyContent: "center",
    gap: 5,
    height: 56,
    marginTop: 8,
  },
  bar: { width: 3, borderRadius: 2, backgroundColor: c.greenLight },
  prompt: { ...s.small, color: c.greenLight, textAlign: "center" },
  transcript: {
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 23,
    color: c.paper,
    textAlign: "center",
  },
});

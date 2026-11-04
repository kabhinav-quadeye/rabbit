import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { Mic, Square } from "lucide-react-native";
import { speech } from "./speech";
import { colors as c, s } from "./theme";

type Phase = "idle" | "starting" | "listening" | "stopping";
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
      return "Your device’s language isn’t supported by its speech service. You can still type your post.";
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
              setMessage("Text added. Review your draft before posting.");
            transition("idle");
          }),
        ]
      : [];
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
      phase === "listening" ? 60_000 : 15_000,
    );
    return () => clearTimeout(timer);
  }, [phase]);

  async function start() {
    if (!available || disabled || full || current.current !== "idle") return;
    received.current = false;
    failed.current = false;
    setError("");
    setMessage("");
    setInterim("");
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
      speech!.start({
        lang: Intl.DateTimeFormat().resolvedOptions().locale,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        addsPunctuation: true,
        recordingOptions: { persist: false },
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
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? "Stop dictation" : "Dictate post content"}
        accessibilityState={
          {
            disabled: locked,
            busy: phase === "starting" || phase === "stopping",
          } as any
        }
        disabled={locked}
        onPress={active ? stop : start}
        style={({ hovered, pressed }: any) => [
          s.row,
          {
            gap: 8,
            minHeight: 48,
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            borderRadius: 9,
            backgroundColor: active || hovered || pressed ? c.greenLight : c.bg,
            opacity: locked ? 0.5 : 1,
          },
        ]}
      >
        <Glyph size={16} color={c.green} strokeWidth={1.8} />
        <Text style={[s.label, { color: c.green }]}>
          {phase === "starting"
            ? "Starting dictation…"
            : phase === "stopping"
              ? "Finishing dictation…"
              : active
                ? "Stop dictation"
                : "Dictate"}
        </Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={s.small}>
        {!available
          ? unavailable
          : phase === "listening"
            ? "Listening…"
            : message ||
              (full
                ? "Shorten your post to dictate more."
                : "Speak to add text. Your device’s speech service may process audio. Rabbit saves only text.")}
      </Text>
      {!!interim && (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.text, { color: c.muted }]}
        >
          {interim}
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

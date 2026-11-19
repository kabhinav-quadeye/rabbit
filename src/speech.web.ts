import { EventEmitter } from "expo";
import {
  ExpoWebSpeechRecognition,
  type ExpoSpeechRecognitionErrorCode,
  type ExpoSpeechRecognitionNativeEventMap,
  type ExpoSpeechRecognitionOptions,
} from "expo-speech-recognition";

type VoiceEvents = Pick<
  ExpoSpeechRecognitionNativeEventMap,
  | "start"
  | "speechstart"
  | "speechend"
  | "audioend"
  | "result"
  | "error"
  | "end"
>;
const listeners = new EventEmitter<{
  [Name in keyof VoiceEvents]: (event: VoiceEvents[Name]) => void;
}>();
let active: InstanceType<typeof ExpoWebSpeechRecognition> | undefined;

export const speech = {
  addListener: listeners.addListener.bind(listeners),
  isRecognitionAvailable: () => !!ExpoWebSpeechRecognition,
  start(options: ExpoSpeechRecognitionOptions) {
    const recognition = new ExpoWebSpeechRecognition();
    recognition.lang = options.lang ?? "en-US";
    recognition.interimResults = options.interimResults ?? false;
    recognition.continuous = options.continuous ?? false;
    recognition.maxAlternatives = options.maxAlternatives ?? 1;

    for (const name of ["start", "speechstart", "speechend"] as const) {
      recognition.addEventListener(name, () => {
        if (active === recognition) listeners.emit(name, null);
      });
    }
    recognition.addEventListener("audioend", (event) => {
      if (active === recognition)
        listeners.emit("audioend", {
          uri: null,
          timestamp: performance.timeOrigin + event.timeStamp,
        });
    });
    recognition.addEventListener("result", ({ resultIndex, results }) => {
      if (active !== recognition) return;
      const interim: string[] = [];
      for (let index = resultIndex; index < results.length; index++) {
        const result = results[index];
        const transcript = result[0]?.transcript.trim();
        if (!transcript) continue;
        if (result.isFinal) {
          listeners.emit("result", {
            isFinal: true,
            results: [
              { transcript, confidence: result[0].confidence, segments: [] },
            ],
          });
        } else {
          interim.push(transcript);
        }
      }
      listeners.emit("result", {
        isFinal: false,
        results: [
          { transcript: interim.join(" "), confidence: -1, segments: [] },
        ],
      });
    });
    recognition.addEventListener("error", (event) => {
      if (active === recognition)
        listeners.emit("error", {
          error: event.error as ExpoSpeechRecognitionErrorCode,
          message: event.message,
        });
    });
    recognition.addEventListener("end", () => {
      if (active !== recognition) return;
      active = undefined;
      listeners.emit("end", null);
    });
    active = recognition;
    recognition.start();
  },
  stop() {
    active?.stop();
  },
  abort() {
    const recognition = active;
    active = undefined;
    recognition?.abort();
  },
};

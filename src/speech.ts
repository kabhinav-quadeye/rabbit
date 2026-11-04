import { requireOptionalNativeModule } from "expo";
import type { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

// Expo Go and older installed builds can still compose by typing.
export const speech = requireOptionalNativeModule<
  typeof ExpoSpeechRecognitionModule
>("ExpoSpeechRecognition");

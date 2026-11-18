import { useEffect, useState } from "react";
import { Platform } from "react-native";

type InstallPrompt = Event & {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    rabbitInstallPrompt?: InstallPrompt;
  }

  interface Navigator {
    standalone?: boolean;
  }
}

function browserInstructions() {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  ) {
    return "Open the browser’s Share menu, choose Add to Home Screen, then tap Add.";
  }
  if (
    userAgent.includes("Safari/") &&
    !/Chrome\/|Chromium\/|Edg\//.test(userAgent)
  ) {
    return "In Safari, choose File → Add to Dock.";
  }
  return "";
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt>();
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (Platform.OS !== "web" || !window.isSecureContext) return;

    if (!__DEV__ && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch((error) => {
        console.warn("Rabbit could not register its offline page.", error);
      });
    }

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const installed = displayMode.matches || navigator.standalone;
      setPrompt(installed ? undefined : window.rabbitInstallPrompt);
      setInstructions(installed ? "" : browserInstructions());
    };
    const onInstalled = () => {
      setPrompt(undefined);
      setInstructions("");
      setMessage("");
    };

    update();
    window.addEventListener("beforeinstallprompt", update);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", update);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", update);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setMessage(message ? "" : instructions);
      return;
    }

    delete window.rabbitInstallPrompt;
    setPrompt(undefined);
    try {
      await prompt.prompt();
    } catch {
      setMessage(
        "Open your browser menu and look for an option to install Rabbit.",
      );
    }
  }

  return { canInstall: Boolean(prompt || instructions), install, message };
}

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
// Firebase clients use the server only for scoped agent connections; the
// existing app data still goes directly through Firebase and its rules.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
const children = [
  spawn(process.execPath, ["server/index.ts"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    "npx",
    ["expo", "start", "--web", "--port", process.env.WEB_PORT ?? "8081"],
    { stdio: "inherit", env: { ...process.env, EXPO_NO_TELEMETRY: "1" } },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
children.forEach((child) =>
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  }),
);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

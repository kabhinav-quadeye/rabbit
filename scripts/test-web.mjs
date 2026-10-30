import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "rabbit-browser-"));
const child = spawn(process.execPath, ["scripts/dev.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DB_PATH: join(directory, "test.sqlite"),
    API_PORT: "3002",
    WEB_PORT: "8082",
    CI: "1",
    // Keep the existing isolated SQLite browser suite independent of cloud data.
    ...(process.env.RABBIT_E2E_FIREBASE === "1"
      ? {}
      : { EXPO_PUBLIC_BACKEND: "local" }),
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  rmSync(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});

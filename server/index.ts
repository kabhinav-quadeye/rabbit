import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApi } from "./api.ts";
const dbPath = process.env.DB_PATH ?? "data/rabbit.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });
const firebaseGateway = process.env.RABBIT_FIREBASE_AGENT === "1";
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
if (firebaseGateway && (!projectId || !apiKey))
  throw new Error(
    "Configure the Firebase project ID and API key for the agent gateway.",
  );
const app = createApi({
  firebaseAgentConfig: firebaseGateway ? { projectId, apiKey } : undefined,
  dbPath,
  staticDir: process.env.SERVE_WEB === "1" ? "dist" : undefined,
});
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
app.server.listen(port, "0.0.0.0", () =>
  console.log(
    `Rabbit API${process.env.SERVE_WEB === "1" ? " + web" : ""}: http://localhost:${port}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    app.server.close(async () => {
      await app.close();
      process.exit(0);
    }),
  );

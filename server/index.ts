import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createApi } from "./api.ts";
const dbPath = process.env.DB_PATH ?? "data/rabbit.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });
const app = createApi({
  dbPath: process.env.RABBIT_AGENT_BACKEND === "firebase" ? ":memory:" : dbPath,
  firebaseAgents: process.env.RABBIT_AGENT_BACKEND === "firebase",
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
    app.server.close(() => {
      app.close();
      process.exit(0);
    }),
  );

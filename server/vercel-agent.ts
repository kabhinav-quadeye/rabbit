import type { IncomingMessage, ServerResponse } from "node:http";
import { createFirebaseAgent } from "./firebase-agent.ts";
import { sendJson, serveAgent } from "./agent-api.ts";

let gateway: ReturnType<typeof createFirebaseAgent> | undefined;

export function vercelAgent(endpoint: "mcp" | "connection") {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!gateway) {
      const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
      const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
      const credential = process.env.RABBIT_FIREBASE_ADMIN_JSON;
      if (!projectId || !apiKey || !credential) {
        sendJson(res, { error: "Rabbit agent access is not configured." }, 503);
        return;
      }
      try {
        gateway = createFirebaseAgent({ projectId, apiKey }, credential);
      } catch {
        sendJson(res, { error: "Rabbit agent configuration is invalid." }, 503);
        return;
      }
    }
    const agent = gateway;
    await serveAgent(
      req,
      res,
      endpoint,
      agent.keys,
      (request) => agent.authenticate(request.headers.authorization),
      agent.actions,
    );
  };
}

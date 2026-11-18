import type { IncomingMessage, ServerResponse } from "node:http";

export default async function connection(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const { vercelAgent } = await import("../../server/vercel-agent.ts");
  return vercelAgent("connection")(req, res);
}

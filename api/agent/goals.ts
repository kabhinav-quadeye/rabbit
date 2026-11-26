import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const { vercelAgent } = await import("../../server/vercel-agent.ts");
  return vercelAgent("goals")(req, res);
}

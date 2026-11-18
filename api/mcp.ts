import type { IncomingMessage, ServerResponse } from "node:http";

export default async function mcp(req: IncomingMessage, res: ServerResponse) {
  const { vercelAgent } = await import("../server/vercel-agent.ts");
  return vercelAgent("mcp")(req, res);
}

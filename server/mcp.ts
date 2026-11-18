import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "./domain.ts";
import type { AgentProposal } from "../src/agent.ts";
import type { GoalsOverview, Post } from "../src/types.ts";

export type AgentTools = {
  search(query: string): Post[] | Promise<Post[]>;
  goals(): GoalsOverview | Promise<GoalsOverview>;
  propose(
    kind: AgentProposal["kind"],
    input: { title: string; body?: string; why?: string },
  ): AgentProposal | Promise<AgentProposal>;
};

export async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  input: unknown,
  actions: AgentTools,
) {
  const server = new McpServer({ name: "rabbit", version: "1.0.0" });
  const run = async (action: () => Promise<Record<string, unknown>>) => {
    try {
      const result = await action();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof AppError
                ? error.message
                : "Rabbit could not complete this action.",
          },
        ],
      };
    }
  };
  server.registerTool(
    "search_posts",
    {
      description: "Search posts visible to your Rabbit account.",
      inputSchema: {
        query: z.string().trim().min(1).max(500),
        offset: z.number().int().min(0).max(100000).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, offset }) =>
      run(async () => {
        const posts = await actions.search(query);
        return {
          posts: posts
            .slice(offset, offset + 10)
            .map(
              ({
                id,
                title,
                body,
                authorId,
                audienceType,
                audienceId,
                type,
                url,
                tags,
                createdAt,
              }) => ({
                id,
                title,
                body,
                authorId,
                audienceType,
                audienceId,
                type,
                url,
                tags,
                createdAt,
              }),
            ),
          nextOffset: offset + 10 < posts.length ? offset + 10 : null,
        };
      }),
  );
  server.registerTool(
    "list_goals",
    {
      description: "List goals and tasks visible to your Rabbit account.",
      annotations: { readOnlyHint: true },
    },
    () => run(async () => actions.goals()),
  );
  server.registerTool(
    "create_post_draft",
    {
      description:
        "Send a note draft to Rabbit for the user to review. Approval creates a private post.",
      inputSchema: {
        title: z.string().trim().min(1).max(180),
        body: z.string().max(20000).default(""),
      },
      annotations: { destructiveHint: false },
    },
    (args) =>
      run(async () => ({ proposal: await actions.propose("post", args) })),
  );
  server.registerTool(
    "suggest_goal",
    {
      description:
        "Send a goal suggestion to Rabbit for the user to review. Approval creates a private goal.",
      inputSchema: {
        title: z.string().trim().min(1).max(120),
        why: z.string().max(500).default(""),
      },
      annotations: { destructiveHint: false },
    },
    (args) =>
      run(async () => ({ proposal: await actions.propose("goal", args) })),
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.setHeader("Cache-Control", "no-store");
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, input);
  } finally {
    await server.close();
  }
}

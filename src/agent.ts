import { AppError, createService } from "./domain.ts";

export type AgentProposal = {
  id: string;
  ownerId: string;
  kind: "post" | "goal";
  title: string;
  description: string;
  createdAt: string;
};

export function makeAgentProposal(
  id: string,
  ownerId: string,
  kind: AgentProposal["kind"],
  input: { title: string; body?: string; why?: string },
): AgentProposal {
  const title = input.title.trim();
  const description = (
    kind === "post" ? (input.body ?? "") : (input.why ?? "")
  ).trim();
  if (!title || title.length > (kind === "post" ? 180 : 120))
    throw new AppError("Enter a title within the character limit.");
  if (description.length > (kind === "post" ? 20000 : 500))
    throw new AppError("The description is too long.");
  return {
    id,
    ownerId,
    kind,
    title,
    description,
    createdAt: new Date().toISOString(),
  };
}

export function approveAgentProposal(
  service: ReturnType<typeof createService>,
  ownerId: string,
  proposal: AgentProposal,
) {
  if (proposal.ownerId !== ownerId)
    throw new AppError("Proposal not found.", 404);
  return proposal.kind === "post"
    ? service.createPost(ownerId, {
        title: proposal.title,
        body: proposal.description,
        audienceType: "self",
      })
    : service.createGoal(ownerId, {
        title: proposal.title,
        why: proposal.description,
      });
}

export const goalWebFetchPath = "/agent/goals";

export type GoalTaskSuggestion = { goalId: string; description: string };

export function validWebFetchGoalId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

export function parseGoalTaskSuggestion(
  params: URLSearchParams,
  goalIdKey = "goalId",
  descriptionKey = "description",
): GoalTaskSuggestion | null {
  const goalId = params.get(goalIdKey);
  const description = params.get(descriptionKey)?.trim();
  if (!validWebFetchGoalId(goalId) || !description || description.length > 500)
    return null;
  return { goalId, description };
}

export function goalTaskReviewPath({
  goalId,
  description,
}: GoalTaskSuggestion) {
  return `/#${new URLSearchParams({ rabbitGoal: goalId, suggestedTask: description })}`;
}

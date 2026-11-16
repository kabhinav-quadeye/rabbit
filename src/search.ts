import type { Post, State, SearchPage } from "./types.ts";

export const SEARCH_PAGE_SIZE = 25;
// Complete words, including Unicode letters and numbers. Punctuation separates
// words, so #tags, handles and URL components share the same matching contract.
export function searchWords(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
}
export const indexToken = (word: string) => word.slice(0, 200);
export function postSearchTokens(
  post: Pick<Post, "title" | "body" | "tags" | "url">,
): string[] {
  return [
    ...new Set(
      searchWords(
        `${post.title} ${post.body} ${post.tags.join(" ")} ${post.url ?? ""}`,
      ).map(indexToken),
    ),
  ];
}
export function searchableWords(
  post: Post,
  state: Pick<State, "users" | "groups">,
): string[] {
  const author = state.users.find((u) => u.id === post.authorId);
  const circle =
    post.audienceType === "group"
      ? state.groups.find((g) => g.id === post.audienceId)
      : undefined;
  return [
    ...searchWords(
      `${post.title} ${post.body} ${post.tags.join(" ")} ${post.url ?? ""}`,
    ),
    ...searchWords(
      `${author?.name ?? ""} ${author?.handle ?? ""} ${circle?.name ?? ""}`,
    ),
  ];
}
export function inSearchScope(post: Post, uid: string, scope: string): boolean {
  if (scope === "groups" || scope === "circles")
    return post.audienceType === "group";
  if (scope === "personal")
    return post.audienceType === "self" && post.authorId === uid;
  if (scope === "people") return post.audienceType === "user";
  if (scope === "saved") return post.savedBy.includes(uid);
  return true;
}
// Merge bounded query streams without skipping documents. A full stream may
// have unseen records: only consume through the earliest such stream's end.
export function mergeSearchStreams(streams: Post[][]): SearchPage {
  const ends = streams
    .filter((s) => s.length === SEARCH_PAGE_SIZE)
    .map((s) => s.at(-1)!.id)
    .sort();
  const boundary = ends[0] ?? null;
  const posts = [
    ...new Map(
      streams
        .flat()
        .filter((p) => !boundary || p.id <= boundary)
        .map((p) => [p.id, p]),
    ).values(),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Also cap the combined page when disjoint streams each returned fewer than 25.
  const page = posts.slice(0, SEARCH_PAGE_SIZE);
  return {
    posts: page,
    nextCursor: posts.length > SEARCH_PAGE_SIZE ? page.at(-1)!.id : boundary,
  };
}

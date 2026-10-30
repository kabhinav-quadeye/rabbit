import type { State, User, Group, Post, PostInput } from "./types.ts";

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message: string, status = 400): never => {
  throw new AppError(message, status);
};
const text = (value: unknown, label: string, max: number, required = true) => {
  if (typeof value !== "string" || (required && !value.trim()))
    return fail(`${label} is required.`);
  const result = value.trim();
  if (result.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return result;
};
export function createService(
  initial: State,
  persist: (state: State) => void = () => {},
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
) {
  const state: State = structuredClone(initial);
  const user = (id: string): User =>
    state.users.find((u) => u.id === id) ?? fail("User not found.", 404);
  const group = (id: string): Group =>
    state.groups.find((g) => g.id === id) ?? fail("Group not found.", 404);
  const isMember = (id: string, groupId: string) =>
    state.groups.some((g) => g.id === groupId && g.memberIds.includes(id));
  const canRead = (id: string, p: Post) =>
    p.authorId === id ||
    (p.audienceType === "user" && p.audienceId === id) ||
    (p.audienceType === "group" && isMember(id, p.audienceId));
  const readablePost = (id: string, postId: string) => {
    user(id);
    const p = state.posts.find((p) => p.id === postId);
    if (!p || !canRead(id, p))
      return fail("You do not have access to this post.", 403);
    return p;
  };
  const commit = <T>(value: T): T => {
    persist(structuredClone(state));
    return structuredClone(value);
  };
  const publicUser = (u: User) => ({
    id: u.id,
    name: u.name,
    handle: u.handle,
    bio: u.bio,
    color: u.color,
    avatar: u.avatar,
  });
  const visiblePosts = (id: string) => {
    user(id);
    return state.posts
      .filter((p) => canRead(id, p))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  return {
    bootstrap(id: string) {
      return structuredClone({
        currentUser: { ...publicUser(user(id)), email: user(id).email },
        users: state.users.map(publicUser),
        groups: state.groups.filter((g) => g.memberIds.includes(id)),
        posts: visiblePosts(id),
      });
    },
    createPost(id: string, input: PostInput) {
      user(id);
      if (!["self", "user", "group"].includes(input.audienceType))
        fail("Choose a valid audience.");
      const audienceId =
        input.audienceType === "self"
          ? id
          : text(input.audienceId, "Audience", 100);
      if (input.audienceType === "group" && !isMember(id, audienceId))
        fail("You must be a member to post to this group.", 403);
      if (input.audienceType === "user") user(audienceId);
      const title = text(input.title, "Title", 180);
      const body = text(input.body ?? "", "Post", 20000, false);
      const type = input.type ?? "note";
      if (!["note", "link", "question"].includes(type))
        fail("Choose a valid post type.");
      let url: string | undefined;
      if (type === "link") {
        url = text(input.url, "Link", 2000);
        try {
          if (!["http:", "https:"].includes(new URL(url).protocol))
            fail("Use an http or https link.");
        } catch {
          fail("Enter a valid http or https link.");
        }
      }
      if (!Array.isArray(input.tags ?? [])) fail("Tags must be a list.");
      const tags = [
        ...new Set(
          (input.tags ?? []).map((t) =>
            text(t, "Tag", 30).replace(/^#/, "").toLowerCase(),
          ),
        ),
      ]
        .filter(Boolean)
        .slice(0, 6);
      const p: Post = {
        id: randomUUID(),
        authorId: id,
        audienceType: input.audienceType,
        audienceId,
        title,
        body,
        type,
        url,
        tags,
        createdAt: new Date().toISOString(),
        votes: [],
        savedBy: [],
        comments: [],
      };
      state.posts.push(p);
      return commit(p);
    },
    createGroup(id: string, input: Partial<Group>) {
      user(id);
      const name = text(input.name, "Group name", 60);
      if (!Array.isArray(input.memberIds ?? []))
        fail("Members must be a list.");
      const ids = [...new Set([id, ...(input.memberIds ?? [])])];
      ids.forEach(user);
      const g: Group = {
        id: randomUUID(),
        name,
        description: text(input.description ?? "", "Description", 300, false),
        memberIds: ids,
        ownerId: id,
        color: ["sage", "peach", "lavender", "blue", "sand"].includes(
          input.color ?? "",
        )
          ? input.color!
          : "sage",
        icon: input.icon ?? "users",
      };
      state.groups.push(g);
      return commit(g);
    },
    addMembers(id: string, groupId: string, ids: string[]) {
      user(id);
      const g = group(groupId);
      if (!g.memberIds.includes(id))
        fail("You must be a member to invite people.", 403);
      if (!Array.isArray(ids) || !ids.length) fail("Choose at least one user.");
      ids.forEach(user);
      g.memberIds = [...new Set([...g.memberIds, ...ids])];
      return commit(g);
    },
    search(id: string, query: string, scope = "all") {
      const words = query
        .trim()
        .toLowerCase()
        .replace(/#/g, "")
        .split(/\s+/)
        .filter(Boolean);
      return structuredClone(
        visiblePosts(id).filter((p) => {
          if (scope === "groups" && p.audienceType !== "group") return false;
          if (
            scope === "personal" &&
            !(p.audienceType === "self" && p.authorId === id)
          )
            return false;
          if (scope === "people" && p.audienceType !== "user") return false;
          if (scope === "saved" && !p.savedBy.includes(id)) return false;
          const author = user(p.authorId);
          const circle =
            p.audienceType === "group" ? group(p.audienceId).name : "";
          const haystack =
            `${p.title} ${p.body} ${p.tags.join(" ")} ${p.url ?? ""} ${author.name} ${author.handle} ${circle}`.toLowerCase();
          return words.every((word) => haystack.includes(word));
        }),
      );
    },
    toggleSave(id: string, postId: string) {
      const p = readablePost(id, postId);
      p.savedBy = p.savedBy.includes(id)
        ? p.savedBy.filter((x) => x !== id)
        : [...p.savedBy, id];
      return commit(p);
    },
    toggleVote(id: string, postId: string) {
      const p = readablePost(id, postId);
      p.votes = p.votes.includes(id)
        ? p.votes.filter((x) => x !== id)
        : [...p.votes, id];
      return commit(p);
    },
    addComment(id: string, postId: string, body: string) {
      const p = readablePost(id, postId);
      p.comments.push({
        id: randomUUID(),
        authorId: id,
        body: text(body, "Comment", 4000),
        createdAt: new Date().toISOString(),
      });
      return commit(p);
    },
    updateProfile(id: string, input: Partial<User>) {
      const u = user(id);
      u.name = text(input.name, "Name", 60);
      u.bio = text(input.bio ?? "", "Bio", 240, false);
      return commit(publicUser(u));
    },
  };
}

import type {
  State,
  User,
  Group,
  Post,
  PostInput,
  FriendRequest,
  Goal,
  GoalTask,
  GoalInput,
  TaskInput,
} from "./types.ts";
import {
  MAX_DEPTH,
  ancestors,
  descendants,
  goalMembers,
  isGoalMember,
} from "./goals.ts";

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
  now: () => Date = () => new Date(),
) {
  const state: State = structuredClone(initial);
  state.friendRequests ??= [];
  state.goals ??= [];
  state.goalTasks ??= [];
  const goals = state.goals,
    goalTasks = state.goalTasks;
  const requests = state.friendRequests;
  const friendIds = (id: string) =>
    requests
      .filter(
        (r) =>
          r.status === "accepted" && [r.senderId, r.recipientId].includes(id),
      )
      .map((r) => (r.senderId === id ? r.recipientId : r.senderId));
  const requireFriends = (id: string, ids: string[], place = "a circle") => {
    ids.forEach(user);
    if (ids.some((other) => other !== id && !friendIds(id).includes(other)))
      fail(`You can only add accepted friends to ${place}.`, 403);
  };
  const MAX_GOAL_MEMBERS = 50;
  const user = (id: string): User =>
    state.users.find((u) => u.id === id) ?? fail("User not found.", 404);
  const group = (id: string): Group =>
    state.groups.find((g) => g.id === id) ?? fail("Circle not found.", 404);
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
  const tonesList = ["sage", "peach", "lavender", "blue", "sand"] as const;
  const goalIcons = [
    "run",
    "book",
    "leaf",
    "language",
    "flag",
    "heart",
  ] as const;
  const priorities = ["none", "low", "medium", "high"] as const;
  const calendarDate = (value: unknown, label: string) => {
    if (value === null || value === undefined || value === "") return null;
    const match =
      typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date =
      match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    if (!match || !date || date.toISOString().slice(0, 10) !== value)
      return fail(`${label} must be a valid date.`);
    return value as string;
  };
  // People outside a goal get 404s, so they never learn it exists. Members
  // work on tasks together; only the owner changes the goal's settings.
  const memberGoal = (id: string, goalId: string): Goal =>
    goals.find((g) => g.id === goalId && isGoalMember(g, id)) ??
    fail("Goal not found.", 404);
  const ownGoal = (id: string, goalId: string, action: string): Goal => {
    const g = memberGoal(id, goalId);
    if (g.ownerId !== id)
      fail(`Only the goal’s owner can ${action}.`, 403);
    return g;
  };
  const memberTask = (id: string, taskId: string): GoalTask => {
    const t = goalTasks.find((t) => t.id === taskId);
    const g = t && goals.find((g) => g.id === t.goalId);
    if (!t || !(g ? isGoalMember(g, id) : t.ownerId === id))
      return fail("Task not found.", 404);
    return t;
  };
  const memberList = (value: unknown) => {
    if (!Array.isArray(value ?? [])) fail("Members must be a list.");
    return [...new Set(((value as unknown[]) ?? []).map(String))];
  };
  const reopen = (list: GoalTask[], stamp: string) =>
    list
      .filter((t) => t.status === "done")
      .map((t) => {
        t.status = "open";
        t.completedAt = null;
        t.completedBy = null;
        t.updatedAt = stamp;
        return t;
      });
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  return {
    bootstrap(id: string) {
      return structuredClone({
        currentUser: { ...publicUser(user(id)), email: user(id).email },
        users: state.users.map(publicUser),
        groups: state.groups.filter((g) => g.memberIds.includes(id)),
        posts: visiblePosts(id),
        friendIds: friendIds(id),
        friendRequests: requests.filter((r) =>
          [r.senderId, r.recipientId].includes(id),
        ),
      });
    },
    findUsers(id: string, query: string) {
      user(id);
      const handle = query.trim().replace(/^@/, "").toLowerCase();
      return structuredClone(
        handle
          ? state.users
              .filter(
                (u) => u.id !== id && u.handle.toLowerCase().startsWith(handle),
              )
              .slice(0, 20)
              .map(publicUser)
          : [],
      );
    },
    sendFriendRequest(id: string, recipientId: string) {
      user(id);
      user(recipientId);
      if (id === recipientId)
        fail("You cannot send a friend request to yourself.");
      const pair = requests.filter(
        (r) =>
          [r.senderId, r.recipientId].includes(id) &&
          [r.senderId, r.recipientId].includes(recipientId),
      );
      if (pair.some((r) => r.status === "accepted"))
        fail("You are already friends.", 409);
      if (pair.some((r) => r.status === "pending"))
        fail("A friend request is already pending.", 409);
      const request: FriendRequest = {
        id: `${id}:${recipientId}`,
        senderId: id,
        recipientId,
        status: "pending",
      };
      const previous = requests.findIndex((r) => r.id === request.id);
      if (previous >= 0) requests[previous] = request;
      else requests.push(request);
      return commit(request);
    },
    respondToFriendRequest(
      id: string,
      requestId: string,
      status: "accepted" | "declined",
    ) {
      user(id);
      const request =
        requests.find((r) => r.id === requestId) ??
        fail("Friend request not found.", 404);
      if (request.recipientId !== id)
        fail("Only the recipient can respond to this request.", 403);
      if (!["accepted", "declined"].includes(status))
        fail("Choose a valid response.");
      if (request.status !== "pending")
        fail("This request is no longer pending.", 409);
      request.status = status;
      return commit(request);
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
        fail("You must be a member to post to this circle.", 403);
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
        outdatedBy: [],
        comments: [],
      };
      state.posts.push(p);
      return commit(p);
    },
    createGroup(id: string, input: Partial<Group>) {
      user(id);
      const name = text(input.name, "Circle name", 60);
      if (!Array.isArray(input.memberIds ?? []))
        fail("Members must be a list.");
      const ids = [...new Set([id, ...(input.memberIds ?? [])])];
      requireFriends(id, ids);
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
      requireFriends(
        id,
        ids.filter((other) => !g.memberIds.includes(other)),
      );
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
          if ((scope === "groups" || scope === "circles") && p.audienceType !== "group") return false;
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
    toggleOutdated(id: string, postId: string) {
      const p = readablePost(id, postId);
      const marks = p.outdatedBy ?? [];
      p.outdatedBy = marks.includes(id)
        ? marks.filter((other) => other !== id)
        : [...marks, id];
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
    /** Every goal the person owns or was invited to, with all of its tasks. */
    goalsOverview(id: string) {
      const visible = goals.filter((g) => isGoalMember(g, id));
      const ids = new Set(visible.map((g) => g.id));
      return structuredClone({
        goals: visible,
        tasks: goalTasks.filter((t) => ids.has(t.goalId)),
      });
    },
    createGoal(id: string, input: GoalInput) {
      const title = text(input.title, "Goal title", 120);
      const memberIds = [id, ...memberList(input.memberIds)].filter(
        (x, i, all) => all.indexOf(x) === i,
      );
      requireFriends(
        id,
        memberIds.filter((x) => x !== id),
        "a goal",
      );
      if (memberIds.length > MAX_GOAL_MEMBERS)
        fail(`A goal can be shared with up to ${MAX_GOAL_MEMBERS} people.`);
      if (
        goals.filter((g) => g.ownerId === id && g.status !== "archived")
          .length >= 50
      )
        fail("You can have up to 50 goals in progress. Archive one first.");
      const stamp = now().toISOString();
      const g: Goal = {
        id: randomUUID(),
        ownerId: id,
        title,
        why: text(input.why ?? "", "Why it matters", 500, false),
        color: tonesList.includes(input.color as any) ? input.color! : "sage",
        icon: goalIcons.includes(input.icon as any) ? input.icon! : "flag",
        targetDate: calendarDate(input.targetDate, "Target date"),
        status: "active",
        createdAt: stamp,
        updatedAt: stamp,
        reachedAt: null,
        memberIds,
      };
      goals.push(g);
      return commit(g);
    },
    updateGoal(id: string, goalId: string, input: GoalInput) {
      const g = ownGoal(id, goalId, "change it");
      const next = { ...g };
      if (input.title !== undefined)
        next.title = text(input.title, "Goal title", 120);
      if (input.why !== undefined)
        next.why = text(input.why, "Why it matters", 500, false);
      if (input.color !== undefined) {
        if (!tonesList.includes(input.color as any))
          fail("Choose a valid colour.");
        next.color = input.color;
      }
      if (input.icon !== undefined) {
        if (!goalIcons.includes(input.icon as any))
          fail("Choose a valid icon.");
        next.icon = input.icon;
      }
      if (input.targetDate !== undefined)
        next.targetDate = calendarDate(input.targetDate, "Target date");
      const stamp = now().toISOString();
      if (input.status !== undefined && input.status !== g.status) {
        if (!["active", "reached", "archived"].includes(input.status))
          fail("Choose a valid goal status.");
        if (
          input.status !== "archived" &&
          g.status === "archived" &&
          goals.filter((x) => x.ownerId === id && x.status !== "archived")
            .length >= 50
        )
          fail("You can have up to 50 goals in progress. Archive one first.");
        next.status = input.status;
        next.reachedAt = input.status === "reached" ? stamp : null;
      }
      next.updatedAt = stamp;
      Object.assign(g, next);
      return commit(g);
    },
    /** Any member can bring in their own accepted friends, as in circles. */
    shareGoal(id: string, goalId: string, ids: string[]) {
      const g = memberGoal(id, goalId);
      const current = goalMembers(g);
      const added = memberList(ids);
      if (!added.length) fail("Choose at least one friend.");
      const fresh = added.filter((other) => !current.includes(other));
      requireFriends(id, fresh, "a goal");
      if (current.length + fresh.length > MAX_GOAL_MEMBERS)
        fail(`A goal can be shared with up to ${MAX_GOAL_MEMBERS} people.`);
      g.memberIds = [...current, ...fresh];
      return commit(g);
    },
    /** Members can leave; the owner can remove anyone but themself. */
    removeGoalMember(id: string, goalId: string, memberId: string) {
      const g = memberGoal(id, goalId);
      if (memberId === g.ownerId)
        fail("The owner can’t leave their own goal. Delete it instead.");
      if (memberId !== id && g.ownerId !== id)
        fail("Only the goal’s owner can remove people.", 403);
      const current = goalMembers(g);
      if (!current.includes(memberId)) fail("This person isn’t in the goal.", 404);
      g.memberIds = current.filter((x) => x !== memberId);
      return commit(g);
    },
    deleteGoal(id: string, goalId: string) {
      const g = ownGoal(id, goalId, "delete it");
      const taskIds = goalTasks
        .filter((t) => t.goalId === g.id)
        .map((t) => t.id);
      goals.splice(goals.indexOf(g), 1);
      const remaining = goalTasks.filter((t) => t.goalId !== g.id);
      goalTasks.splice(0, goalTasks.length, ...remaining);
      return commit({ id: g.id, taskIds });
    },
    /** Returns the new task first, followed by any done ancestors it reopened. */
    createTask(id: string, goalId: string, input: TaskInput) {
      const g = memberGoal(id, goalId);
      const description = text(input.description, "Task description", 500);
      if (goalTasks.filter((t) => t.goalId === g.id).length >= 500)
        fail("A goal can hold up to 500 tasks.");
      const priority = input.priority ?? "none";
      if (!priorities.includes(priority)) fail("Choose a valid priority.");
      let parent: GoalTask | null = null;
      if (input.parentId) {
        parent = memberTask(id, input.parentId);
        if (parent.goalId !== g.id)
          fail("A sub-task must belong to the same goal as its parent.");
        if (parent.depth + 1 > MAX_DEPTH)
          fail(`Tasks can be nested up to ${MAX_DEPTH + 1} levels.`);
      }
      const stamp = now().toISOString();
      const t: GoalTask = {
        id: randomUUID(),
        // Tasks belong to the goal's owner, whoever adds them.
        ownerId: g.ownerId,
        goalId: g.id,
        parentId: parent?.id ?? null,
        depth: parent ? parent.depth + 1 : 0,
        description,
        notes: text(input.notes ?? "", "Notes", 10000, false),
        priority,
        dueDate: calendarDate(input.dueDate, "Due date"),
        status: "open",
        createdAt: stamp,
        updatedAt: stamp,
        completedAt: null,
      };
      const reopened = parent
        ? reopen([parent, ...ancestors(goalTasks, parent)], stamp)
        : [];
      goalTasks.push(t);
      return commit([t, ...reopened]);
    },
    updateTask(id: string, taskId: string, input: TaskInput) {
      const t = memberTask(id, taskId);
      const next = { ...t };
      if (input.description !== undefined)
        next.description = text(input.description, "Task description", 500);
      if (input.notes !== undefined)
        next.notes = text(input.notes, "Notes", 10000, false);
      if (input.priority !== undefined) {
        if (!priorities.includes(input.priority))
          fail("Choose a valid priority.");
        next.priority = input.priority;
      }
      if (input.dueDate !== undefined)
        next.dueDate = calendarDate(input.dueDate, "Due date");
      next.updatedAt = now().toISOString();
      Object.assign(t, next);
      return commit(t);
    },
    /** Completes a task; with cascade, also every open descendant. Returns changed tasks. */
    completeTask(id: string, taskId: string, cascade: boolean) {
      const t = memberTask(id, taskId);
      const open = descendants(goalTasks, t.id).filter(
        (x) => x.status === "open",
      );
      if (open.length && !cascade)
        fail(`This task has ${plural(open.length, "open sub-task")}.`, 409);
      const stamp = now().toISOString();
      const changed = [t, ...open].filter((x) => x.status === "open");
      for (const x of changed) {
        x.status = "done";
        x.completedAt = stamp;
        x.completedBy = id;
        x.updatedAt = stamp;
      }
      return commit(changed);
    },
    /** Reopens a task and any done ancestors. Returns changed tasks. */
    reopenTask(id: string, taskId: string) {
      const t = memberTask(id, taskId);
      return commit(
        reopen([t, ...ancestors(goalTasks, t)], now().toISOString()),
      );
    },
    deleteTask(id: string, taskId: string) {
      const t = memberTask(id, taskId);
      const ids = [t.id, ...descendants(goalTasks, t.id).map((x) => x.id)];
      const remaining = goalTasks.filter((x) => !ids.includes(x.id));
      goalTasks.splice(0, goalTasks.length, ...remaining);
      return commit({ ids });
    },
    updateProfile(id: string, input: Partial<User>) {
      const u = user(id);
      u.name = text(input.name, "Name", 60);
      u.bio = text(input.bio ?? "", "Bio", 240, false);
      return commit(publicUser(u));
    },
  };
}

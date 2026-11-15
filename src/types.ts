export type User = {
  id: string;
  name: string;
  handle: string;
  bio?: string;
  color?: string;
  avatar?: string;
  email?: string;
};
export type Group = {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  ownerId: string;
  color: string;
  icon: string;
};
export type Comment = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};
export type Post = {
  id: string;
  authorId: string;
  audienceType: "self" | "user" | "group";
  audienceId: string;
  title: string;
  body: string;
  tags: string[];
  type: "note" | "link" | "question";
  url?: string;
  createdAt: string;
  votes: string[];
  savedBy: string[];
  outdatedBy?: string[];
  comments: Comment[];
};
export type FriendRequest = {
  id: string;
  senderId: string;
  recipientId: string;
  status: "pending" | "accepted" | "declined";
};
export type Tone = "sage" | "peach" | "lavender" | "blue" | "sand";
export type GoalIcon = "run" | "book" | "leaf" | "language" | "flag" | "heart";
export type Goal = {
  id: string;
  ownerId: string;
  title: string;
  why: string;
  color: Tone;
  icon: GoalIcon;
  /** Calendar date, YYYY-MM-DD. */
  targetDate: string | null;
  status: "active" | "reached" | "archived";
  createdAt: string;
  updatedAt: string;
  reachedAt: string | null;
};
export type Priority = "none" | "low" | "medium" | "high";
export type GoalTask = {
  id: string;
  ownerId: string;
  goalId: string;
  /** null when the task sits directly under its goal. */
  parentId: string | null;
  depth: number;
  description: string;
  notes: string;
  priority: Priority;
  /** Calendar date, YYYY-MM-DD. */
  dueDate: string | null;
  status: "open" | "done";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
export type GoalInput = Partial<
  Pick<Goal, "title" | "why" | "color" | "icon" | "targetDate" | "status">
>;
export type TaskInput = Partial<
  Pick<GoalTask, "description" | "notes" | "priority" | "dueDate" | "parentId">
>;
export type GoalsOverview = { goals: Goal[]; tasks: GoalTask[] };
export type State = {
  users: User[];
  groups: Group[];
  posts: Post[];
  friendRequests?: FriendRequest[];
  goals?: Goal[];
  goalTasks?: GoalTask[];
};
export type Bootstrap = State & {
  currentUser: User;
  friendRequests: FriendRequest[];
  friendIds: string[];
};
export type PostInput = Pick<Post, "audienceType" | "title" | "body"> &
  Partial<Pick<Post, "audienceId" | "type" | "url" | "tags">>;

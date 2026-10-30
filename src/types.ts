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
  comments: Comment[];
};
export type FriendRequest = {
  id: string;
  senderId: string;
  recipientId: string;
  status: "pending" | "accepted" | "declined";
};
export type State = {
  users: User[];
  groups: Group[];
  posts: Post[];
  friendRequests?: FriendRequest[];
};
export type Bootstrap = State & {
  currentUser: User;
  friendRequests: FriendRequest[];
  friendIds: string[];
};
export type PostInput = Pick<Post, "audienceType" | "title" | "body"> &
  Partial<Pick<Post, "audienceId" | "type" | "url" | "tags">>;

import React, { useState } from "react";
import { View, Text, Pressable, TextInput, Linking } from "react-native";
import {
  ArrowUp,
  ClockAlert,
  Bookmark,
  MessageCircle,
  ArrowUpRight,
  LockKeyhole,
  Link2,
  Send,
  CircleHelp,
  FileText,
} from "lucide-react-native";
import { colors as c, fonts, s, tones } from "./theme";
import { Action, Avatar, Empty } from "./ui";
import { Sheet } from "./Sheet";
import type { Bootstrap, Post } from "./types";
export function relativeTime(iso: string) {
  const mins = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60000),
  );
  return mins < 60
    ? `${mins}m ago`
    : mins < 1440
      ? `${Math.floor(mins / 60)}h ago`
      : `${Math.floor(mins / 1440)}d ago`;
}
export function PostCard({
  post,
  data,
  onOpen,
  onAction,
  onTag,
  onGroup,
  detail = false,
}: {
  post: Post;
  data: Bootstrap;
  onOpen: (p: Post) => void;
  onAction: (id: string, action: string) => Promise<void>;
  onTag: (tag: string) => void;
  onGroup: (id: string) => void;
  detail?: boolean;
}) {
  const author = data.users.find((u) => u.id === post.authorId),
    group = data.groups.find((g) => g.id === post.audienceId),
    recipient = data.users.find((u) => u.id === post.audienceId);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const saved = post.savedBy.includes(data.currentUser.id),
    voted = post.votes.includes(data.currentUser.id);
  const outdatedBy = post.outdatedBy ?? [];
  const markedOutdated = outdatedBy.includes(data.currentUser.id);
  const audience =
    post.audienceType === "self"
      ? "Just me"
      : post.audienceType === "group"
        ? group?.name
        : post.authorId === data.currentUser.id
          ? `To ${recipient?.name.split(" ")[0]}`
          : "Shared with you";
  const tone =
    post.audienceType === "group"
      ? (tones[group?.color ?? "sage"] ?? tones.sage)
      : tones.sage;
  async function act(action: string) {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      await onAction(post.id, action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const urlHost = post.url
    ? new URL(post.url).hostname.replace(/^www\./, "")
    : "";
  return (
    <View style={[!detail && s.card, { padding: detail ? 0 : 22, gap: 14 }]}>
      <View style={[s.between, { gap: 10, alignItems: "flex-start" }]}>
        <View style={[s.row, { gap: 9, flex: 1, flexWrap: "wrap" }]}>
          <Avatar user={author} size={32} />
          <Text style={[s.label, { fontSize: 12 }]}>
            {author?.id === data.currentUser.id ? "You" : author?.name}
          </Text>
          <Text style={[s.small, { color: "#AFB5AB" }]}>/</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              post.audienceType === "group" && onGroup(post.audienceId)
            }
            style={[
              s.row,
              {
                gap: 5,
                paddingHorizontal: 7,
                paddingVertical: 4,
                borderRadius: 5,
                backgroundColor: tone.bg,
              },
            ]}
          >
            <LockKeyhole size={10} color={tone.ink} />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.medium,
                fontSize: 10,
                color: tone.ink,
              }}
            >
              {audience}
            </Text>
          </Pressable>
        </View>
        <Text style={[s.small, { fontSize: 10, marginTop: 8 }]}>
          {relativeTime(post.createdAt)}
        </Text>
      </View>
      {!!outdatedBy.length && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            s.row,
            {
              gap: 10,
              alignItems: "flex-start",
              backgroundColor: c.sand,
              borderRadius: 9,
              padding: 12,
            },
          ]}
        >
          <ClockAlert size={18} color={c.ink} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.label}>May be outdated</Text>
            <Text style={[s.small, { color: c.ink }]}>
              {outdatedBy.length === 1
                ? "1 reader flagged this information."
                : `${outdatedBy.length} readers flagged this information.`}{" "}
              Check the latest details before relying on it.
            </Text>
          </View>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open post: ${post.title}`}
          onPress={() => onOpen(post)}
        >
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fonts.semibold,
              fontSize: detail ? 24 : 19,
              lineHeight: detail ? 32 : 27,
              color: c.ink,
              letterSpacing: -0.4,
            }}
          >
            {post.title}
          </Text>
        </Pressable>
        <Text
          numberOfLines={detail ? undefined : 3}
          style={[s.text, { fontSize: 13, lineHeight: 22, color: "#697167" }]}
        >
          {post.body}
        </Text>
      </View>
      {post.type === "link" && post.url && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${urlHost}`}
          onPress={() => Linking.openURL(post.url!)}
          style={[
            s.row,
            {
              gap: 13,
              backgroundColor: "#F3F1E9",
              borderRadius: 10,
              padding: 14,
            },
          ]}
        >
          <View
            style={{
              backgroundColor: "#E7DFC9",
              borderRadius: 7,
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BookLink />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                fontFamily: fonts.medium,
                fontSize: 12,
                color: "#635C45",
              }}
              numberOfLines={1}
            >
              {urlHost}
            </Text>
            <Text style={[s.small, { fontSize: 11, color: "#7E7763" }]}>
              A link worth a little of your time
            </Text>
          </View>
          <ArrowUpRight size={17} color="#8E866C" />
        </Pressable>
      )}
      {!!post.tags.length && (
        <View style={[s.row, { gap: 10, flexWrap: "wrap" }]}>
          {post.tags.map((t) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Search tag ${t}`}
              key={t}
              onPress={() => onTag(t)}
              style={{ minHeight: 30, justifyContent: "center" }}
            >
              <Text
                style={{
                  fontFamily: fonts.regular,
                  fontSize: 11,
                  color: "#6D7E61",
                }}
              >
                #{t}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View
        style={[
          s.between,
          {
            borderTopWidth: 1,
            borderColor: "#F0F1EB",
            paddingTop: 8,
            marginTop: -3,
          },
        ]}
      >
        <View style={[s.row, { gap: 12, flex: 1, flexWrap: "wrap" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voted ? "Remove useful vote" : "Mark useful"}
            disabled={!!busy}
            onPress={() => act("vote")}
            style={[s.row, { gap: 5, minHeight: 48 }]}
          >
            <ArrowUp
              size={14}
              color={voted ? c.green : c.muted}
              strokeWidth={voted ? 2.5 : 1.7}
            />
            <Text
              style={[
                s.small,
                { fontSize: 11, color: voted ? c.green : c.muted },
              ]}
            >
              {post.votes.length} useful
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Comments on ${post.title}`}
            onPress={() => onOpen(post)}
            style={[s.row, { gap: 6, minHeight: 48 }]}
          >
            <MessageCircle size={13} color={c.muted} />
            <Text style={[s.small, { fontSize: 11 }]}>
              {post.comments.length}{" "}
              {post.comments.length === 1 ? "reply" : "replies"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              markedOutdated ? "Remove outdated mark" : "Mark outdated"
            }
            accessibilityState={{ disabled: !!busy, selected: markedOutdated }}
            aria-pressed={markedOutdated}
            disabled={!!busy}
            onPress={() => act("outdated")}
            style={({
              pressed,
              hovered,
            }: {
              pressed: boolean;
              hovered?: boolean;
            }) => [
              s.row,
              {
                gap: 5,
                minHeight: 48,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: markedOutdated
                  ? c.sand
                  : pressed || hovered
                    ? c.greenLight
                    : "transparent",
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <ClockAlert size={14} color={markedOutdated ? c.ink : c.muted} />
            <Text
              style={[
                s.small,
                { fontSize: 11, color: markedOutdated ? c.ink : c.muted },
              ]}
            >
              {busy === "outdated"
                ? "Updating…"
                : markedOutdated
                  ? "Marked outdated"
                  : "Outdated?"}
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? "Unsave post" : "Save post"}
          disabled={!!busy}
          onPress={() => act("save")}
          style={{
            minHeight: 48,
            minWidth: 48,
            alignSelf: "flex-start",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bookmark
            size={15}
            color={saved ? c.green : c.muted}
            fill={saved ? c.green : "transparent"}
            strokeWidth={1.7}
          />
        </Pressable>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
function BookLink() {
  return <Link2 size={20} color="#8B7851" strokeWidth={1.6} />;
}
export function PostDetail({
  post,
  data,
  onClose,
  onAction,
  onTag,
  onGroup,
  onComment,
}: {
  post: Post;
  data: Bootstrap;
  onClose: () => void;
  onAction: (id: string, action: string) => Promise<void>;
  onTag: (tag: string) => void;
  onGroup: (id: string) => void;
  onComment: (id: string, body: string) => Promise<void>;
}) {
  const [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send() {
    setBusy(true);
    setError("");
    try {
      await onComment(post.id, comment);
      setComment("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="A closer look" onClose={onClose} closeLabel="Close post" wide>
      <PostCard
        post={post}
        data={data}
        onOpen={() => {}}
        onAction={onAction}
        onTag={onTag}
        onGroup={onGroup}
        detail
      />
      <View style={{ marginTop: 24, gap: 18 }}>
        <Text style={[s.h2, { fontSize: 17 }]}>
          The conversation{" "}
          <Text style={{ color: c.muted, fontSize: 13 }}>
            ({post.comments.length})
          </Text>
        </Text>
        {!post.comments.length && (
          <Text style={[s.text, { color: c.muted, fontSize: 13 }]}>
            A fresh thread. Add the first thought.
          </Text>
        )}
        {post.comments.map((comment) => (
          <View
            key={comment.id}
            style={[s.row, { gap: 10, alignItems: "flex-start" }]}
          >
            <Avatar
              user={data.users.find((u) => u.id === comment.authorId)}
              size={30}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[s.row, { gap: 8 }]}>
                <Text style={s.label}>
                  {data.users.find((u) => u.id === comment.authorId)?.name}
                </Text>
                <Text style={[s.small, { fontSize: 10 }]}>
                  {relativeTime(comment.createdAt)}
                </Text>
              </View>
              <Text style={[s.text, { fontSize: 13 }]}>{comment.body}</Text>
            </View>
          </View>
        ))}
        <View style={{ gap: 10, marginTop: 8 }}>
          <TextInput
            multiline
            accessibilityLabel="Write a comment"
            placeholder="Add something to the conversation…"
            placeholderTextColor={c.muted}
            value={comment}
            onChangeText={setComment}
            maxLength={4000}
            style={[
              s.field,
              { minHeight: 80, textAlignVertical: "top", fontSize: 13 },
            ]}
          />
          {!!error && <Text style={s.error}>{error}</Text>}
          <Action
            label="Send comment"
            icon={Send}
            onPress={send}
            disabled={!comment.trim()}
            loading={busy}
            style={{ alignSelf: "flex-end" }}
          >
            Reply
          </Action>
        </View>
      </View>
    </Sheet>
  );
}

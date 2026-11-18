import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import FileText from "lucide-react-native/icons/file-text";
import Link2 from "lucide-react-native/icons/link-2";
import CircleHelp from "lucide-react-native/icons/circle-question-mark";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import Hash from "lucide-react-native/icons/hash";
import UserRound from "lucide-react-native/icons/user-round";
import Check from "lucide-react-native/icons/check";
import Users from "lucide-react-native/icons/users";
import Palette from "lucide-react-native/icons/palette";
import Blocks from "lucide-react-native/icons/blocks";
import BookOpen from "lucide-react-native/icons/book-open";
import { Textarea, TextareaInput } from "../components/ui/textarea";
import { colors as c, fonts, s, tones } from "./theme";
import { Action, Avatar, GroupIcon, Chip } from "./ui";
import { Sheet } from "./Sheet";
import { VoiceInput } from "./VoiceInput";
import type { Bootstrap, PostInput } from "./types";
type Props = {
  data: Bootstrap;
  destination: string;
  setDestination: (v: string) => void;
  onPublish: (input: PostInput) => Promise<void>;
};
export function Composer({
  data,
  destination,
  setDestination,
  onPublish,
}: Props) {
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [tags, setTags] = useState(""),
    [type, setType] = useState<"note" | "link" | "question">("note"),
    [url, setUrl] = useState("");
  const [showTags, setShowTags] = useState(false),
    [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const [dictating, setDictating] = useState(false);
  const key = `rabbit.draft.${data.currentUser.id}`;
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key).then((value) => {
      if (!alive) return;
      if (value) {
        try {
          const d = JSON.parse(value);
          setTitle(d.title ?? "");
          setBody(d.body ?? "");
          setTags(d.tags ?? "");
          setType(d.type ?? "note");
          setUrl(d.url ?? "");
          setShowTags(!!d.tags);
        } catch {}
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(
        key,
        JSON.stringify({ title, body, tags, type, url }),
      ).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [title, body, tags, type, url, ready, key]);
  const [kind, id] = destination.split(":");
  const group = data.groups.find((g) => g.id === id),
    person = data.users.find((u) => u.id === id);
  const label =
    kind === "group" ? group?.name : kind === "user" ? person?.name : "Just me";
  const tone =
    kind === "group"
      ? (tones[group?.color ?? "sage"] ?? tones.sage)
      : kind === "user"
        ? (tones[person?.color ?? "blue"] ?? tones.blue)
        : tones.sage;
  const GroupGlyph =
    group?.icon === "palette"
      ? Palette
      : group?.icon === "blocks"
        ? Blocks
        : group?.icon === "book"
          ? BookOpen
          : Users;
  const AudienceGlyph =
    kind === "group" ? GroupGlyph : kind === "user" ? UserRound : LockKeyhole;
  const privacy =
    kind === "group"
      ? `Visible to ${group?.memberIds.length ?? 0} circle members`
      : kind === "user"
        ? `Only you and ${person?.name.split(" ")[0]}`
        : "Only you can see this";
  async function publish() {
    if (dictating || busy) return;
    setBusy(true);
    setError("");
    try {
      await onPublish({
        audienceType:
          kind === "group" ? "group" : kind === "user" ? "user" : "self",
        audienceId: id,
        title,
        body,
        type,
        url,
        tags: tags.split(/[ ,#]+/).filter(Boolean),
      });
      setTitle("");
      setBody("");
      setTags("");
      setUrl("");
      setShowTags(false);
      await AsyncStorage.removeItem(key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[s.card, { overflow: "hidden" }]}>
      <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
        <View style={[s.between, { gap: 12, flexWrap: "wrap" }]}>
          <View style={[s.row, { gap: 10 }]}>
            <Avatar user={data.currentUser} size={36} />
            <View>
              <Text style={[s.label, { fontSize: 13 }]}>
                {data.currentUser.name}
              </Text>
              <Text style={[s.small, { fontSize: 11 }]}>
                A thought worth keeping
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose audience, ${label}`}
            onPress={() => setPicker(true)}
            style={({ hovered }: any) => [
              s.row,
              {
                gap: 7,
                borderRadius: 7,
                paddingHorizontal: 10,
                minHeight: 36,
                maxWidth: 240,
                backgroundColor: tone.bg,
                opacity: hovered ? 0.85 : 1,
              },
            ]}
          >
            <AudienceGlyph size={13} color={tone.ink} />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.medium,
                fontSize: 12,
                color: tone.ink,
                flexShrink: 1,
              }}
            >
              {label}
            </Text>
            <ChevronDown size={13} color={tone.ink} />
          </Pressable>
        </View>
        <View style={[s.row, { gap: 8, marginTop: 22, marginBottom: 9 }]}>
          {(
            [
              { id: "note", label: "Note", icon: FileText },
              { id: "link", label: "Link", icon: Link2 },
              { id: "question", label: "Question", icon: CircleHelp },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected: type === t.id }}
              onPress={() => {
                setType(t.id);
                setError("");
              }}
              style={[
                s.row,
                {
                  gap: 6,
                  paddingHorizontal: 11,
                  minHeight: 34,
                  borderRadius: 6,
                  backgroundColor: type === t.id ? "#F0F3E9" : "transparent",
                },
              ]}
            >
              <t.icon
                size={14}
                color={type === t.id ? c.green : c.muted}
                strokeWidth={1.7}
              />
              <Text
                style={{
                  fontFamily: type === t.id ? fonts.medium : fonts.regular,
                  fontSize: 12,
                  color: type === t.id ? c.green : c.muted,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel="Post title"
          placeholder={
            type === "question"
              ? "What are you curious about?"
              : "Give your thought a title…"
          }
          placeholderTextColor={c.muted}
          value={title}
          onChangeText={setTitle}
          maxLength={180}
          style={
            {
              fontFamily: fonts.medium,
              fontSize: 23,
              letterSpacing: -0.6,
              color: c.ink,
              paddingVertical: 10,
              minHeight: 52,
              outlineStyle: "none",
            } as any
          }
        />
        <Textarea
          style={{
            borderWidth: 0,
            minHeight: 138,
            height: 138,
            backgroundColor: "transparent",
          }}
        >
          <TextareaInput
            accessibilityLabel="Post content"
            aria-label="Post content"
            placeholder={
              "Something you learned. A link worth keeping.\nA question for your circle."
            }
            placeholderTextColor={c.muted}
            value={body}
            onChangeText={setBody}
            maxLength={20000}
            style={{
              fontFamily: fonts.regular,
              padding: 0,
              fontSize: 14,
              lineHeight: 24,
              textAlignVertical: "top",
              color: c.ink,
            }}
          />
        </Textarea>
        <VoiceInput
          disabled={busy || !ready}
          full={body.length >= 20000}
          onActiveChange={setDictating}
          onText={(text) =>
            setBody((previous) =>
              `${previous}${previous && !/\s$/.test(previous) ? " " : ""}${text}`.slice(
                0,
                20000,
              ),
            )
          }
        />
        {type === "link" && (
          <View
            style={[
              s.row,
              {
                gap: 8,
                marginBottom: 16,
                backgroundColor: c.bg,
                borderRadius: 8,
                paddingHorizontal: 12,
              },
            ]}
          >
            <Link2 size={16} color={c.muted} />
            <TextInput
              accessibilityLabel="Link URL"
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://a-link-worth-sharing.com"
              placeholderTextColor={c.muted}
              value={url}
              onChangeText={setUrl}
              style={{
                flex: 1,
                fontFamily: fonts.regular,
                fontSize: 13,
                color: c.ink,
                minHeight: 44,
              }}
            />
          </View>
        )}
        {showTags ? (
          <View style={[s.row, { gap: 6, paddingBottom: 16 }]}>
            <Hash size={15} color={c.muted} />
            <TextInput
              accessibilityLabel="Post tags"
              placeholder="design, books, something-good"
              placeholderTextColor={c.muted}
              value={tags}
              onChangeText={setTags}
              maxLength={180}
              autoCapitalize="none"
              style={{
                flex: 1,
                fontFamily: fonts.regular,
                fontSize: 13,
                color: c.ink,
                minHeight: 34,
              }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowTags(true)}
            style={[
              s.row,
              {
                gap: 6,
                alignSelf: "flex-start",
                minHeight: 38,
                marginBottom: 10,
              },
            ]}
          >
            <Hash size={14} color={c.muted} />
            <Text style={[s.small, { fontSize: 12 }]}>Add tags</Text>
          </Pressable>
        )}
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={[s.error, { marginBottom: 14 }]}
          >
            {error}
          </Text>
        )}
      </View>
      <View
        style={[
          s.between,
          {
            gap: 10,
            paddingHorizontal: 22,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderColor: c.border,
            backgroundColor: "#FDFDFB",
          },
        ]}
      >
        <View style={[s.row, { gap: 6, flex: 1 }]}>
          <LockKeyhole size={12} color={c.muted} />
          <Text style={[s.small, { fontSize: 11, flexShrink: 1 }]}>
            {privacy}
          </Text>
        </View>
        <Action
          label="Publish post"
          icon={ArrowUpRight}
          onPress={publish}
          loading={busy}
          disabled={
            dictating ||
            !ready ||
            !title.trim() ||
            (type === "link" && !url.trim())
          }
          style={{ minHeight: 40, paddingHorizontal: 22 }}
        >
          Post
        </Action>
      </View>
      {picker && (
        <Sheet title="Who is this for?" onClose={() => setPicker(false)}>
          <Text style={[s.text, { color: c.muted, marginBottom: 18 }]}>
            Choose a home for your thought. Only the people you choose can see
            it.
          </Text>
          <AudienceRow
            icon={<LockKeyhole color={c.green} size={20} />}
            title="Just me"
            subtitle="Your personal collection"
            selected={destination === "self"}
            onPress={() => {
              setDestination("self");
              setPicker(false);
            }}
          />
          <Text style={[s.label, { marginTop: 20, marginBottom: 8 }]}>
            Your circles
          </Text>
          {data.groups.map((g) => (
            <AudienceRow
              key={g.id}
              icon={<GroupIcon group={g} />}
              title={g.name}
              subtitle={`${g.memberIds.length} members`}
              selected={destination === `group:${g.id}`}
              onPress={() => {
                setDestination(`group:${g.id}`);
                setPicker(false);
              }}
            />
          ))}
          <Text style={[s.label, { marginTop: 20, marginBottom: 8 }]}>
            A person
          </Text>
          {data.users
            .filter((u) => u.id !== data.currentUser.id)
            .map((u) => (
              <AudienceRow
                key={u.id}
                icon={<Avatar user={u} />}
                title={u.name}
                subtitle={`@${u.handle}`}
                selected={destination === `user:${u.id}`}
                onPress={() => {
                  setDestination(`user:${u.id}`);
                  setPicker(false);
                }}
              />
            ))}
        </Sheet>
      )}
    </View>
  );
}
function AudienceRow({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Share with ${title}`}
      onPress={onPress}
      style={({ hovered }: any) => [
        s.row,
        {
          gap: 12,
          padding: 10,
          borderRadius: 10,
          backgroundColor: selected
            ? c.greenLight
            : hovered
              ? c.bg
              : "transparent",
        },
      ]}
    >
      <View style={{ width: 38, alignItems: "center" }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{title}</Text>
        <Text style={s.small}>{subtitle}</Text>
      </View>
      {selected && <Check size={17} color={c.green} />}
    </Pressable>
  );
}

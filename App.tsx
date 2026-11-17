import "./global.css";
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SquarePen,
  Clock3,
  UserRound,
  Plus,
  Search,
  LockKeyhole,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Bookmark,
  Users,
  Grid2X2,
  X,
  LogOut,
  SlidersHorizontal,
  ArrowLeft,
  Check,
  Hash,
  FileText,
  Send,
  CircleHelp,
  Leaf,
  Sprout,
} from "lucide-react-native";
import { GluestackUIProvider } from "./components/ui/gluestack-ui-provider";
import { colors as c, tones, fonts, s } from "./src/theme";
import {
  Brand,
  Avatar,
  GroupIcon,
  Action,
  IconButton,
  Chip,
  Empty,
  Field,
  Privacy,
} from "./src/ui";
import { Composer } from "./src/Composer";
import { PostCard, PostDetail } from "./src/Posts";
import { Friends } from "./src/Friends";
import { Circles, GroupForm } from "./src/Groups";
import { Auth } from "./src/Auth";
import { GoalsScreen } from "./src/GoalsScreen";
import {
  request,
  restoreToken,
  setToken,
  loadSpace,
  searchPosts,
} from "./src/api";
import type { Bootstrap, Post, Group, PostInput } from "./src/types";

type Tab = "home" | "recent" | "goals" | "profile";
const navItems = [
  { id: "home" as Tab, label: "Your space", icon: SquarePen },
  { id: "recent" as Tab, label: "Recent posts", icon: Clock3 },
  { id: "goals" as Tab, label: "Goals", icon: Sprout },
  { id: "profile" as Tab, label: "Profile", icon: UserRound },
];
export default function App() {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode="light">
        <StatusBar style="dark" />
        {loaded || error ? (
          <Rabbit />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: c.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Brand />
          </View>
        )}
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
}
function Rabbit() {
  const { width } = useWindowDimensions();
  const desktop = width >= 960,
    wide = width >= 1230;
  const [data, setData] = useState<Bootstrap | null>(null),
    [loading, setLoading] = useState(true),
    [bootError, setBootError] = useState(""),
    [demoEnabled, setDemoEnabled] = useState(false);
  const [tab, setTab] = useState<Tab>("home"),
    [mode, setMode] = useState("post"),
    [destination, setDestination] = useState("self"),
    [selectedGroup, setSelectedGroup] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("newest");
  const [groupForm, setGroupForm] = useState<true | Group | false>(false),
    [selectedPost, setSelectedPost] = useState<string | null>(null),
    [toast, setToast] = useState(""),
    [searchQuery, setSearchQuery] = useState(""),
    [searchScope, setSearchScope] = useState("all");
  const [searchResults, setSearchResults] = useState<Post[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [profileMode, setProfileMode] = useState("posts"),
    [editing, setEditing] = useState(false),
    [profileName, setProfileName] = useState(""),
    [bio, setBio] = useState(""),
    [profileError, setProfileError] = useState(""),
    [profileBusy, setProfileBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  async function refresh() {
    const next = await loadSpace();
    setData(next);
    return next;
  }
  async function openDemo() {
    const auth = await request<{ token: string }>("/auth/demo", "POST", {});
    await setToken(auth.token);
    await AsyncStorage.removeItem("rabbit.signedout");
    await refresh();
  }
  async function boot() {
    setLoading(true);
    setBootError("");
    try {
      const health = await request<{ demo: boolean }>("/health");
      setDemoEnabled(health.demo);
      const token = await restoreToken();
      if (token) {
        try {
          await refresh();
        } catch (e) {
          if ((e as Error).message.includes("session")) {
            await setToken(null);
          } else throw e;
        }
      } else if (
        health.demo &&
        !(await AsyncStorage.getItem("rabbit.signedout"))
      ) {
        await openDemo();
      }
    } catch (e) {
      setBootError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    boot();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (mode !== "search" || !data) return;
    let active = true;
    setSearching(true);
    setSearchError("");
    const timer = setTimeout(() => {
      searchPosts(searchQuery, searchScope)
        .then((p) => {
          if (active) setSearchResults(p);
        })
        .catch((e) => {
          if (active) setSearchError(e.message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, searchScope, mode, data]);
  function navigate(next: Tab) {
    setTab(next);
    setSelectedGroup(null);
    setMode("post");
    setSelectedPost(null);
    setFilter("all");
    setEditing(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function openGroup(id: string) {
    setTab("recent");
    setSelectedGroup(id);
    setMode("post");
    setSelectedPost(null);
    setFilter("all");
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function doSearch(query = "") {
    setSelectedPost(null);
    setTab("home");
    setSelectedGroup(null);
    setMode("search");
    setSearchQuery(query);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function postAction(id: string, action: string, input = {}) {
    const updated = await request<Post>(
      `/posts/${id}/${action}`,
      "POST",
      input,
    );
    const field =
      action === "save"
        ? "savedBy"
        : action === "vote"
          ? "votes"
          : action === "outdated"
            ? "outdatedBy"
            : "comments";
    // Separate interactions can finish out of order; retain newer unrelated fields.
    setData(
      (current) =>
        current && {
          ...current,
          posts: current.posts.map((post) =>
            post.id === updated.id
              ? { ...post, [field]: updated[field] }
              : post,
          ),
        },
    );
  }
  async function publish(input: PostInput) {
    await request("/posts", "POST", input);
    await refresh();
    setToast("Your post is in the right place.");
  }
  async function saveGroup(input: any) {
    if (groupForm && groupForm !== true) {
      await request(`/groups/${groupForm.id}/members`, "POST", input);
      await refresh();
      setGroupForm(false);
      setToast("A little more room in your circle.");
    } else {
      const group = await request<Group>("/groups", "POST", input);
      await refresh();
      setGroupForm(false);
      openGroup(group.id);
      setToast("Your new circle is ready.");
    }
  }
  async function authenticate(authMode: string, input: any) {
    const auth = await request<{ token: string }>(
      `/auth/${authMode}`,
      "POST",
      input,
    );
    await setToken(auth.token);
    await AsyncStorage.removeItem("rabbit.signedout");
    await refresh();
    navigate("home");
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await request("/auth/logout", "POST", {});
      await setToken(null);
      await AsyncStorage.setItem("rabbit.signedout", "1");
      setData(null);
      setGroupForm(false);
      setSelectedPost(null);
      navigate("home");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSigningOut(false);
    }
  }
  async function saveProfile() {
    setProfileBusy(true);
    setProfileError("");
    try {
      await request("/profile", "PATCH", { name: profileName, bio });
      await refresh();
      setEditing(false);
      setToast("Your profile feels a little more you.");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <Brand />
        <View style={{ width: 260, gap: 12, marginTop: 20 }}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                height: i === 1 ? 16 : 50,
                borderRadius: 8,
                backgroundColor: "#E7EBDF",
                width: i === 1 ? "60%" : "100%",
              }}
            />
          ))}
        </View>
        <Text style={s.small}>Making room for your thoughts…</Text>
      </View>
    );
  if (bootError)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: c.bg,
          gap: 20,
        }}
      >
        <Brand />
        <Text style={[s.text, { textAlign: "center", maxWidth: 380 }]}>
          {bootError}
        </Text>
        <Action onPress={boot}>Try again</Action>
      </View>
    );
  if (!data)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <Auth
          onAuth={authenticate}
          onDemo={openDemo}
          demoEnabled={demoEnabled}
        />
      </SafeAreaView>
    );
  const user = data.currentUser,
    group = data.groups.find((g) => g.id === selectedGroup),
    post = data.posts.find((p) => p.id === selectedPost);
  const nav = (mobile = false) => (
    <View
      style={
        mobile
          ? [
              s.row,
              {
                justifyContent: "space-around",
                paddingTop: 5,
                paddingBottom: 5,
                borderTopWidth: 1,
                borderColor: c.border,
                backgroundColor: c.paper,
              },
            ]
          : { gap: 7 }
      }
    >
      {navItems.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: tab === item.id && !selectedGroup }}
          onPress={() => navigate(item.id)}
          style={({ hovered }: any) =>
            mobile
              ? {
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  minHeight: 54,
                  minWidth: 78,
                }
              : {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 45,
                  paddingHorizontal: 15,
                  borderRadius: 9,
                  backgroundColor:
                    tab === item.id && !selectedGroup
                      ? c.greenLight
                      : hovered
                        ? "#E9EDE2"
                        : "transparent",
                }
          }
        >
          <item.icon
            size={mobile ? 20 : 18}
            color={tab === item.id && !selectedGroup ? c.green : c.muted}
            strokeWidth={tab === item.id && !selectedGroup ? 2 : 1.7}
          />
          <Text
            style={{
              fontFamily:
                tab === item.id && !selectedGroup
                  ? fonts.semibold
                  : fonts.regular,
              fontSize: mobile ? 10 : 13,
              color: tab === item.id && !selectedGroup ? c.green : c.muted,
            }}
          >
            {mobile && item.id === "home" ? "Your space" : item.label}
          </Text>
          {!mobile && item.id === "home" && (
            <View
              style={{
                marginLeft: "auto",
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: c.green,
              }}
            />
          )}
        </Pressable>
      ))}
    </View>
  );
  const postCard = (p: Post) => (
    <PostCard
      key={p.id}
      post={p}
      data={data}
      onOpen={(p) => setSelectedPost(p.id)}
      onAction={postAction}
      onTag={(t) => doSearch(`#${t}`)}
      onGroup={openGroup}
    />
  );
  let feed = data.posts.filter(
    (p) => !group || (p.audienceType === "group" && p.audienceId === group.id),
  );
  if (filter === "groups")
    feed = feed.filter((p) => p.audienceType === "group");
  if (filter === "self") feed = feed.filter((p) => p.audienceType === "self");
  if (filter === "direct") feed = feed.filter((p) => p.audienceType === "user");
  if (sort === "useful")
    feed = [...feed].sort((a, b) => b.votes.length - a.votes.length);
  const pageTitle = group
    ? group.name
    : tab === "profile"
      ? "Your corner of Rabbit."
      : tab === "recent"
        ? "Recent posts"
        : mode === "search"
          ? "Find a little clarity."
          : "What’s worth sharing?";
  const pageSubtitle = group
    ? group.description
    : tab === "profile"
      ? "A collection of your thoughts and the things you want to keep."
      : tab === "recent"
        ? "A little closer to your circles."
        : mode === "search"
          ? "Good information is closer than you think."
          : "A thought, a discovery, a good question. Give it a home.";
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, flexDirection: "row" }}>
          {desktop && (
            <View
              style={{
                width: 228,
                backgroundColor: c.sidebar,
                borderRightWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 19,
                paddingTop: 31,
                paddingBottom: 18,
              }}
            >
              <View style={{ paddingHorizontal: 13, paddingBottom: 38 }}>
                <Brand />
              </View>
              {nav()}
              <View
                style={{
                  height: 1,
                  backgroundColor: "#DFE4D7",
                  marginTop: 25,
                  marginBottom: 25,
                  marginHorizontal: 13,
                }}
              />
              <View
                style={[s.between, { paddingHorizontal: 13, marginBottom: 13 }]}
              >
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 10,
                    color: "#7B8574",
                    letterSpacing: 1.3,
                  }}
                >
                  YOUR CIRCLES
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create a circle"
                  onPress={() => setGroupForm(true)}
                  style={{ padding: 5 }}
                >
                  <Plus size={14} color={c.muted} />
                </Pressable>
              </View>
              {data.groups.slice(0, 5).map((g) => (
                <Pressable
                  key={g.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${g.name}`}
                  onPress={() => openGroup(g.id)}
                  style={({ hovered }: any) => [
                    s.row,
                    {
                      gap: 11,
                      minHeight: 47,
                      paddingHorizontal: 13,
                      borderRadius: 8,
                      backgroundColor:
                        selectedGroup === g.id
                          ? c.greenLight
                          : hovered
                            ? "#E9EDE2"
                            : "transparent",
                    },
                  ]}
                >
                  <GroupIcon group={g} size={27} />
                  <Text
                    style={{
                      fontFamily: fonts.regular,
                      fontSize: 12,
                      color: "#5E695C",
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {g.name}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a circle"
                onPress={() => setGroupForm(true)}
                style={[
                  s.row,
                  {
                    gap: 10,
                    minHeight: 45,
                    paddingHorizontal: 16,
                    marginTop: 5,
                  },
                ]}
              >
                <Plus size={14} color={c.muted} />
                <Text style={[s.small, { fontSize: 12 }]}>Create a circle</Text>
              </Pressable>
              <View style={{ flex: 1, minHeight: 30 }} />
              <View
                style={{
                  padding: 15,
                  backgroundColor: "#E7ECDD",
                  borderRadius: 12,
                  marginHorizontal: 3,
                  marginBottom: 22,
                  gap: 9,
                }}
              >
                <LockKeyhole color="#7D8C6A" size={18} strokeWidth={1.5} />
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 13,
                    lineHeight: 19,
                    color: "#4B6043",
                  }}
                >
                  A smaller circle.{"\n"}A better conversation.
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.regular,
                    fontSize: 11,
                    lineHeight: 18,
                    color: "#748068",
                  }}
                >
                  Just you, your people, and the things worth sharing.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open your profile"
                onPress={() => navigate("profile")}
                style={[
                  s.row,
                  {
                    gap: 10,
                    paddingHorizontal: 9,
                    paddingTop: 17,
                    borderTopWidth: 1,
                    borderColor: "#DFE4D7",
                  },
                ]}
              >
                <Avatar user={user} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { fontSize: 12 }]}>{user.name}</Text>
                  <Text style={[s.small, { fontSize: 10 }]}>
                    @{user.handle}
                  </Text>
                </View>
                <ChevronRight size={14} color={c.muted} />
              </Pressable>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={[
                s.between,
                {
                  height: desktop ? 74 : 68,
                  paddingHorizontal: desktop ? 40 : 16,
                  borderBottomWidth: 1,
                  borderColor: c.border,
                },
              ]}
            >
              {desktop ? (
                <View style={[s.row, { gap: 8 }]}>
                  <Grid2X2 size={15} color={c.muted} />
                  <Text style={[s.small, { fontSize: 12 }]}>
                    {selectedGroup
                      ? "Your circles"
                      : tab === "home"
                        ? "Your space"
                        : tab === "recent"
                          ? "Recent posts"
                          : tab === "goals"
                            ? "Goals"
                            : "Profile"}
                  </Text>
                  {selectedGroup && (
                    <>
                      <ChevronRight size={12} color={c.faint} />
                      <Text style={[s.label, { fontSize: 12 }]}>
                        {group?.name}
                      </Text>
                    </>
                  )}
                </View>
              ) : (
                <View style={{ gap: 1 }}>
                  <Brand compact />
                  {demoEnabled && user.id === "alex" && (
                    <Text style={[s.small, { fontSize: 11, paddingLeft: 39 }]}>
                      Demo space
                    </Text>
                  )}
                </View>
              )}
              <View style={[s.row, { gap: desktop ? 16 : 4 }]}>
                {desktop && demoEnabled && user.id === "alex" && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: 5,
                    }}
                  >
                    <Text style={[s.small, { fontSize: 10 }]}>Demo space</Text>
                  </View>
                )}
                {desktop && (
                  <View style={[s.row, { gap: 5 }]}>
                    <LockKeyhole size={12} color={c.green} />
                    <Text
                      style={{
                        fontFamily: fonts.medium,
                        fontSize: 11,
                        color: c.green,
                      }}
                    >
                      Your private corner
                    </Text>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open your profile"
                  onPress={() => navigate("profile")}
                  style={({ hovered, pressed }: any) => ({
                    minHeight: 48,
                    minWidth: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 9,
                    backgroundColor:
                      hovered || pressed ? c.greenLight : "transparent",
                  })}
                >
                  <Avatar user={user} size={30} />
                </Pressable>
              </View>
            </View>
            {tab === "goals" ? (
              <GoalsScreen
                space={data}
                desktop={desktop}
                wide={wide}
                onToast={setToast}
                onFindFriends={() => navigate("profile")}
              />
            ) : (
              <ScrollView
                ref={scroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: desktop ? 40 : 18,
                  paddingTop: desktop ? 34 : 26,
                  paddingBottom: 36,
                }}
              >
                <View
                  style={{ width: "100%", maxWidth: 1190, alignSelf: "center" }}
                >
                  {group && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => navigate("recent")}
                      style={[
                        s.row,
                        { gap: 6, marginBottom: 20, minHeight: 30 },
                      ]}
                    >
                      <ArrowLeft size={14} color={c.muted} />
                      <Text style={s.small}>All recent posts</Text>
                    </Pressable>
                  )}
                  <View
                    style={[
                      s.between,
                      { gap: 20, alignItems: "flex-start", marginBottom: 28 },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 9 }}>
                      <View style={[s.row, { gap: 13 }]}>
                        {group && <GroupIcon group={group} size={47} />}
                        <Text
                          accessibilityRole="header"
                          style={{
                            fontFamily: fonts.semibold,
                            fontSize: desktop ? 34 : 28,
                            lineHeight: desktop ? 43 : 36,
                            letterSpacing: desktop ? -1 : -0.7,
                            color: c.ink,
                            flexShrink: 1,
                          }}
                        >
                          {pageTitle}
                        </Text>
                      </View>
                      <Text
                        style={[
                          s.text,
                          { fontSize: 13, color: c.muted, lineHeight: 21 },
                        ]}
                      >
                        {pageSubtitle}
                      </Text>
                    </View>
                    {desktop && tab === "home" && (
                      <View style={[s.row, { gap: 6, marginTop: 14 }]}>
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            backgroundColor: "#8DA178",
                            borderRadius: 3,
                          }}
                        />
                        <Text style={[s.small, { fontSize: 11 }]}>
                          A little quieter here.
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 28,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 24 }}>
                      {tab === "home" && (
                        <>
                          <View
                            style={[
                              s.row,
                              {
                                backgroundColor: "#EDEFE6",
                                borderWidth: 1,
                                borderColor: "#E3E7DB",
                                borderRadius: 10,
                                padding: 4,
                                alignSelf: "flex-start",
                                gap: 3,
                              },
                            ]}
                          >
                            {[
                              {
                                id: "post",
                                label: "Write a post",
                                icon: SquarePen,
                              },
                              {
                                id: "search",
                                label: "Search your space",
                                icon: Search,
                              },
                            ].map((t) => (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t.label}
                                accessibilityState={{ selected: mode === t.id }}
                                key={t.id}
                                onPress={() => setMode(t.id)}
                                style={[
                                  s.row,
                                  {
                                    gap: 7,
                                    minHeight: 37,
                                    paddingHorizontal: desktop ? 18 : 13,
                                    borderRadius: 7,
                                    backgroundColor:
                                      mode === t.id ? c.paper : "transparent",
                                  },
                                ]}
                              >
                                <t.icon
                                  size={14}
                                  color={mode === t.id ? c.green : c.muted}
                                />
                                <Text
                                  style={{
                                    fontFamily:
                                      mode === t.id
                                        ? fonts.medium
                                        : fonts.regular,
                                    fontSize: 12,
                                    color: mode === t.id ? c.green : c.muted,
                                  }}
                                >
                                  {t.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          {mode === "post" ? (
                            <Composer
                              data={data}
                              destination={destination}
                              setDestination={setDestination}
                              onPublish={publish}
                            />
                          ) : (
                            <View style={{ gap: 22 }}>
                              <View
                                style={[
                                  s.card,
                                  { padding: desktop ? 24 : 18, gap: 20 },
                                ]}
                              >
                                <View
                                  style={[
                                    s.row,
                                    {
                                      gap: 12,
                                      minHeight: 50,
                                      borderBottomWidth: 1,
                                      borderColor: "#BBCAB0",
                                      paddingBottom: 10,
                                    },
                                  ]}
                                >
                                  <Search
                                    size={21}
                                    color={c.green}
                                    strokeWidth={1.6}
                                  />
                                  <TextInput
                                    autoFocus
                                    accessibilityLabel="Search posts"
                                    placeholder="What are you looking for?"
                                    placeholderTextColor="#85907F"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    style={{
                                      fontFamily: fonts.regular,
                                      fontSize: 18,
                                      color: c.ink,
                                      flex: 1,
                                      minWidth: 0,
                                      minHeight: 42,
                                    }}
                                  />
                                  {!!searchQuery && (
                                    <IconButton
                                      icon={X}
                                      size={16}
                                      label="Clear search"
                                      onPress={() => setSearchQuery("")}
                                    />
                                  )}
                                </View>
                                <View
                                  style={[s.row, { gap: 7, flexWrap: "wrap" }]}
                                >
                                  {[
                                    { id: "all", label: "Everything" },
                                    { id: "groups", label: "Circles" },
                                    { id: "personal", label: "Just me" },
                                    { id: "people", label: "Direct shares" },
                                    { id: "saved", label: "Saved" },
                                  ].map((scope) => (
                                    <Chip
                                      key={scope.id}
                                      active={searchScope === scope.id}
                                      onPress={() => setSearchScope(scope.id)}
                                    >
                                      {scope.label}
                                    </Chip>
                                  ))}
                                </View>
                                <Privacy text="Search only finds things you have access to." />
                              </View>
                              <View style={s.between}>
                                <Text style={[s.h2, { fontSize: 16 }]}>
                                  {searchQuery
                                    ? `Results for “${searchQuery}”`
                                    : "A few things worth finding"}
                                </Text>
                                <Text style={s.small}>
                                  {searching
                                    ? "Searching…"
                                    : `${searchResults.length} posts`}
                                </Text>
                              </View>
                              {!!searchError ? (
                                <View
                                  style={[s.card, { padding: 20, gap: 12 }]}
                                >
                                  <Text
                                    accessibilityRole="alert"
                                    style={s.error}
                                  >
                                    {searchError}
                                  </Text>
                                  <Action
                                    secondary
                                    onPress={() => setData({ ...data })}
                                  >
                                    Try search again
                                  </Action>
                                </View>
                              ) : searchResults.length ? (
                                searchResults.map(postCard)
                              ) : (
                                !searching && (
                                  <View style={s.card}>
                                    <Empty
                                      title="No threads found. Yet."
                                      body="Try another word, a tag, or a wider filter. Your next useful discovery might be one search away."
                                    />
                                  </View>
                                )
                              )}
                            </View>
                          )}
                          {mode === "post" && (
                            <>
                              {!wide && (
                                <MobileCircles
                                  data={data}
                                  onGroup={openGroup}
                                  onCreate={() => setGroupForm(true)}
                                />
                              )}
                              <View style={[s.between, { marginTop: 3 }]}>
                                <Text style={s.h2}>From your circles</Text>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="View all recent posts"
                                  onPress={() => navigate("recent")}
                                  style={[s.row, { gap: 4, minHeight: 30 }]}
                                >
                                  <Text
                                    style={{
                                      fontFamily: fonts.medium,
                                      fontSize: 11,
                                      color: c.green,
                                    }}
                                  >
                                    View all
                                  </Text>
                                  <ArrowRight size={13} color={c.green} />
                                </Pressable>
                              </View>
                              <View style={{ gap: 16, marginTop: -8 }}>
                                {data.posts.slice(0, 3).map(postCard)}
                                {!data.posts.length && (
                                  <View style={s.card}>
                                    <Empty
                                      title="A good place to begin."
                                      body="Save your first thought above, or invite a few people into a new circle."
                                    />
                                  </View>
                                )}
                              </View>
                            </>
                          )}
                        </>
                      )}
                      {tab === "recent" && (
                        <>
                          {group ? (
                            <View style={[s.card, { padding: 20, gap: 18 }]}>
                              <View
                                style={[
                                  s.between,
                                  { gap: 10, flexWrap: "wrap" },
                                ]}
                              >
                                <View style={[s.row, { gap: 8 }]}>
                                  <View style={[s.row, { paddingLeft: 6 }]}>
                                    {group.memberIds.slice(0, 4).map((id) => (
                                      <View
                                        key={id}
                                        style={{
                                          marginLeft: -6,
                                          borderWidth: 2,
                                          borderColor: "white",
                                          borderRadius: 20,
                                        }}
                                      >
                                        <Avatar
                                          user={data.users.find(
                                            (u) => u.id === id,
                                          )}
                                          size={28}
                                        />
                                      </View>
                                    ))}
                                  </View>
                                  <Text style={s.small}>
                                    {group.memberIds.length} members
                                  </Text>
                                  <LockKeyhole size={12} color={c.muted} />
                                </View>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Invite people to circle"
                                  onPress={() => setGroupForm(group)}
                                  style={[s.row, { gap: 5, minHeight: 36 }]}
                                >
                                  <Plus size={14} color={c.green} />
                                  <Text
                                    style={{
                                      fontFamily: fonts.medium,
                                      fontSize: 12,
                                      color: c.green,
                                    }}
                                  >
                                    Invite people
                                  </Text>
                                </Pressable>
                              </View>
                              <Action
                                label="Post to this circle"
                                icon={SquarePen}
                                onPress={() => {
                                  setDestination(`group:${group.id}`);
                                  setTab("home");
                                  setSelectedGroup(null);
                                  setMode("post");
                                  scroll.current?.scrollTo({
                                    y: 0,
                                    animated: false,
                                  });
                                }}
                              >
                                Share with this circle
                              </Action>
                            </View>
                          ) : (
                            <MobileCircles
                              data={data}
                              onGroup={openGroup}
                              onCreate={() => setGroupForm(true)}
                            />
                          )}
                          <View
                            style={[s.between, { gap: 12, flexWrap: "wrap" }]}
                          >
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ gap: 7 }}
                              style={{ flexGrow: 0 }}
                            >
                              {[
                                { id: "all", label: "All posts" },
                                { id: "groups", label: "Circles" },
                                { id: "self", label: "Just me" },
                                { id: "direct", label: "Shared with me" },
                              ]
                                .filter((f) => !group || f.id === "all")
                                .map((f) => (
                                  <Chip
                                    key={f.id}
                                    active={filter === f.id}
                                    onPress={() => setFilter(f.id)}
                                  >
                                    {f.label}
                                  </Chip>
                                ))}
                            </ScrollView>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                sort === "newest"
                                  ? "Sort by most useful"
                                  : "Sort by newest"
                              }
                              onPress={() =>
                                setSort(sort === "newest" ? "useful" : "newest")
                              }
                              style={[s.row, { gap: 5, minHeight: 32 }]}
                            >
                              <SlidersHorizontal size={13} color={c.muted} />
                              <Text style={[s.small, { fontSize: 11 }]}>
                                {sort === "newest"
                                  ? "Newest first"
                                  : "Most useful"}
                              </Text>
                              <ChevronDown size={11} color={c.muted} />
                            </Pressable>
                          </View>
                          <View style={{ gap: 16 }}>
                            {feed.map(postCard)}
                            {!feed.length && (
                              <View style={s.card}>
                                <Empty
                                  title={
                                    group
                                      ? "The first thought is yours."
                                      : "A quiet corner for now."
                                  }
                                  body={
                                    group
                                      ? "Share a useful find, start a question, or post a note for your circle."
                                      : "Posts shared with you will appear here. Try another filter, or start a thread."
                                  }
                                />
                              </View>
                            )}
                          </View>
                        </>
                      )}
                      {tab === "profile" && (
                        <>
                          {profileMode !== "friends" && (
                            <View
                              style={[
                                s.card,
                                { padding: desktop ? 28 : 22, gap: 20 },
                              ]}
                            >
                              <View
                                style={[
                                  s.between,
                                  { gap: 12, flexWrap: "wrap" },
                                ]}
                              >
                                <View
                                  style={[
                                    s.row,
                                    {
                                      gap: 16,
                                      flex: 1,
                                      minWidth: desktop ? 0 : "100%",
                                    },
                                  ]}
                                >
                                  <Avatar user={user} size={64} />
                                  <View
                                    style={{ gap: 4, flex: 1, minWidth: 0 }}
                                  >
                                    <Text style={[s.h2, { fontSize: 23 }]}>
                                      {user.name}
                                    </Text>
                                    <Text style={s.small}>@{user.handle}</Text>
                                  </View>
                                </View>
                                {!editing && (
                                  <Action
                                    label="Edit profile"
                                    secondary
                                    style={{ minHeight: 48 }}
                                    onPress={() => {
                                      setProfileName(user.name);
                                      setBio(user.bio ?? "");
                                      setEditing(true);
                                    }}
                                  >
                                    Edit profile
                                  </Action>
                                )}
                              </View>
                              {editing ? (
                                <View style={{ gap: 18 }}>
                                  <Field
                                    label="Your name"
                                    accessibilityLabel="Your name"
                                    value={profileName}
                                    onChangeText={setProfileName}
                                    maxLength={60}
                                  />
                                  <Field
                                    label="A little about you"
                                    accessibilityLabel="Your bio"
                                    value={bio}
                                    onChangeText={setBio}
                                    maxLength={240}
                                  />
                                  {!!profileError && (
                                    <Text style={s.error}>{profileError}</Text>
                                  )}
                                  <View
                                    style={[
                                      s.row,
                                      { gap: 10, justifyContent: "flex-end" },
                                    ]}
                                  >
                                    <Action
                                      secondary
                                      onPress={() => setEditing(false)}
                                    >
                                      Cancel
                                    </Action>
                                    <Action
                                      label="Save profile"
                                      onPress={saveProfile}
                                      loading={profileBusy}
                                      disabled={!profileName.trim()}
                                    >
                                      Save profile
                                    </Action>
                                  </View>
                                </View>
                              ) : (
                                <Text style={[s.text, { color: c.muted }]}>
                                  {user.bio ||
                                    "A little more curious every day. Add a bio to make this corner yours."}
                                </Text>
                              )}
                              <View
                                style={[
                                  s.row,
                                  {
                                    gap: 16,
                                    flexWrap: "wrap",
                                    paddingTop: 17,
                                    borderTopWidth: 1,
                                    borderColor: c.border,
                                  },
                                ]}
                              >
                                <Text style={s.small}>
                                  {
                                    data.posts.filter(
                                      (p) => p.authorId === user.id,
                                    ).length
                                  }{" "}
                                  thoughts shared
                                </Text>
                                <Text style={s.small}>
                                  {data.groups.length} circles
                                </Text>
                                <Text style={s.small}>
                                  {
                                    data.posts.filter((p) =>
                                      p.savedBy.includes(user.id),
                                    ).length
                                  }{" "}
                                  saved for later
                                </Text>
                              </View>
                            </View>
                          )}
                          <View
                            style={[s.between, { gap: 8, flexWrap: "wrap" }]}
                          >
                            <View
                              style={[
                                s.row,
                                {
                                  gap: 7,
                                  flexWrap: "wrap",
                                  flexGrow: 1,
                                  flexShrink: 0,
                                },
                              ]}
                            >
                              <Chip
                                active={profileMode === "posts"}
                                onPress={() => setProfileMode("posts")}
                                icon={FileText}
                                style={{ minHeight: 48 }}
                              >
                                Your posts
                              </Chip>
                              <Chip
                                active={profileMode === "saved"}
                                onPress={() => setProfileMode("saved")}
                                icon={Bookmark}
                                style={{ minHeight: 48 }}
                              >
                                Saved
                              </Chip>
                              <Chip
                                active={profileMode === "friends"}
                                onPress={() => {
                                  setProfileMode("friends");
                                  refresh().catch((e) => setToast(e.message));
                                }}
                                icon={Users}
                                style={{ minHeight: 48 }}
                              >
                                Friends
                              </Chip>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Sign out"
                              accessibilityState={{
                                disabled: signingOut,
                                busy: signingOut,
                              }}
                              disabled={signingOut}
                              onPress={signOut}
                              style={({ hovered, pressed }: any) => [
                                s.row,
                                {
                                  gap: 8,
                                  minHeight: 48,
                                  paddingHorizontal: desktop ? 14 : 10,
                                  marginLeft: "auto",
                                  borderWidth: 1,
                                  borderColor: c.border,
                                  borderRadius: 9,
                                  backgroundColor:
                                    hovered || pressed ? c.greenLight : c.paper,
                                  opacity: signingOut ? 0.65 : 1,
                                },
                              ]}
                            >
                              {signingOut ? (
                                <ActivityIndicator size={16} color={c.muted} />
                              ) : (
                                <LogOut
                                  size={16}
                                  color={c.muted}
                                  strokeWidth={1.8}
                                />
                              )}
                              <Text
                                style={[s.label, { fontFamily: fonts.medium }]}
                              >
                                {signingOut ? "Signing out…" : "Sign out"}
                              </Text>
                            </Pressable>
                          </View>
                          {profileMode === "friends" ? (
                            <Friends
                              key={user.id}
                              data={data}
                              onChange={refresh}
                            />
                          ) : (
                            <View style={{ gap: 16 }}>
                              {data.posts
                                .filter((p) =>
                                  profileMode === "saved"
                                    ? p.savedBy.includes(user.id)
                                    : p.authorId === user.id,
                                )
                                .map(postCard)}
                              {!data.posts.some((p) =>
                                profileMode === "saved"
                                  ? p.savedBy.includes(user.id)
                                  : p.authorId === user.id,
                              ) && (
                                <View style={s.card}>
                                  <Empty
                                    title={
                                      profileMode === "saved"
                                        ? "Keep the good stuff close."
                                        : "Your first thought is waiting."
                                    }
                                    body={
                                      profileMode === "saved"
                                        ? "Tap the bookmark on any post to find it here later."
                                        : "Write a note, save a link, or share a question with your people."
                                    }
                                  />
                                </View>
                              )}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                    {wide && (
                      <View
                        style={{
                          width: 278,
                          gap: 22,
                          paddingTop: tab === "home" ? 66 : 0,
                        }}
                      >
                        <Circles
                          data={data}
                          onGroup={openGroup}
                          onCreate={() => setGroupForm(true)}
                        />
                        <View
                          style={{
                            backgroundColor: "#E8EEDF",
                            borderRadius: 14,
                            padding: 23,
                            gap: 14,
                          }}
                        >
                          <View style={[s.row, { paddingLeft: 5 }]}>
                            {data.users.slice(1, 4).map((u) => (
                              <View
                                key={u.id}
                                style={{
                                  marginLeft: -5,
                                  borderWidth: 3,
                                  borderColor: "#E8EEDF",
                                  borderRadius: 22,
                                }}
                              >
                                <Avatar user={u} size={35} />
                              </View>
                            ))}
                            <View
                              style={{
                                width: 35,
                                height: 35,
                                borderRadius: 20,
                                backgroundColor: "#D6E0CA",
                                alignItems: "center",
                                justifyContent: "center",
                                marginLeft: -5,
                                borderWidth: 3,
                                borderColor: "#E8EEDF",
                              }}
                            >
                              <Plus size={13} color="#607B4D" />
                            </View>
                          </View>
                          <Text
                            style={{
                              fontFamily: fonts.semibold,
                              fontSize: 23,
                              lineHeight: 29,
                              letterSpacing: -0.6,
                              color: "#3D5638",
                            }}
                          >
                            Good things grow{"\n"}in small circles.
                          </Text>
                          <Text
                            style={{
                              fontFamily: fonts.regular,
                              fontSize: 12,
                              lineHeight: 20,
                              color: "#6B7C5E",
                            }}
                          >
                            Bring your favorite people together around something
                            you care about.
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Create a circle"
                            onPress={() => setGroupForm(true)}
                            style={[s.row, { gap: 6, minHeight: 32 }]}
                          >
                            <Text
                              style={{
                                fontFamily: fonts.semibold,
                                fontSize: 12,
                                color: "#405E35",
                              }}
                            >
                              Start a circle
                            </Text>
                            <ArrowUpRight size={14} color="#405E35" />
                          </Pressable>
                        </View>
                        <View style={{ padding: 3, gap: 13 }}>
                          <View style={[s.row, { gap: 7 }]}>
                            <Hash size={14} color="#839274" />
                            <Text style={[s.label, { fontSize: 12 }]}>
                              Follow your curiosity
                            </Text>
                          </View>
                          <View style={[s.row, { gap: 7, flexWrap: "wrap" }]}>
                            {[
                              "design",
                              "books",
                              "productivity",
                              "building",
                              "learning",
                            ].map((t) => (
                              <Chip
                                key={t}
                                onPress={() => doSearch(`#${t}`)}
                                style={{
                                  minHeight: 29,
                                  paddingHorizontal: 10,
                                  backgroundColor: "#F0F2E9",
                                  borderColor: "transparent",
                                }}
                              >
                                #{t}
                              </Chip>
                            ))}
                          </View>
                        </View>
                        <View style={{ paddingTop: 7 }}>
                          <Privacy />
                          <Text
                            style={[
                              s.small,
                              {
                                fontSize: 10,
                                textAlign: "center",
                                marginTop: 7,
                                color: "#90988B",
                              },
                            ]}
                          >
                            Less noise. More meaning.
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                  {!wide && (
                    <View style={{ marginTop: 28 }}>
                      <Privacy />
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
            {!desktop && nav(true)}
          </View>
        </View>
      </KeyboardAvoidingView>
      {!!toast && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: desktop ? 26 : 83,
            alignSelf: "center",
            maxWidth: width - 36,
            backgroundColor: c.green,
            borderRadius: 10,
            paddingVertical: 13,
            paddingHorizontal: 18,
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
          }}
          accessibilityLiveRegion="polite"
        >
          <Check size={15} color="white" />
          <Text
            style={{
              fontFamily: fonts.medium,
              fontSize: 12,
              color: "white",
              flexShrink: 1,
            }}
          >
            {toast}
          </Text>
        </View>
      )}
      {!!groupForm && (
        <GroupForm
          data={data}
          group={groupForm === true ? undefined : groupForm}
          onClose={() => setGroupForm(false)}
          onSave={saveGroup}
          onFindFriends={() => {
            setGroupForm(false);
            navigate("profile");
            setProfileMode("friends");
          }}
        />
      )}
      {!!post && (
        <PostDetail
          post={post}
          data={data}
          onClose={() => setSelectedPost(null)}
          onAction={postAction}
          onTag={(t) => doSearch(`#${t}`)}
          onGroup={openGroup}
          onComment={async (id, body) => {
            await postAction(id, "comments", { body });
          }}
        />
      )}
    </SafeAreaView>
  );
}
function MobileCircles({
  data,
  onGroup,
  onCreate,
}: {
  data: Bootstrap;
  onGroup: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={s.between}>
        <Text style={[s.label, { fontSize: 13 }]}>Your circles</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a circle"
          onPress={onCreate}
          style={[s.row, { gap: 4, minHeight: 30 }]}
        >
          <Plus size={14} color={c.green} />
          <Text style={[s.small, { color: c.green, fontSize: 11 }]}>
            Create
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9 }}
      >
        {data.groups.map((g) => (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            accessibilityLabel={`Open circle ${g.name}`}
            onPress={() => onGroup(g.id)}
            style={[
              s.row,
              {
                gap: 9,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                padding: 10,
                paddingRight: 16,
              },
            ]}
          >
            <GroupIcon group={g} size={29} />
            <Text style={[s.label, { fontSize: 11 }]}>{g.name}</Text>
          </Pressable>
        ))}
        {!data.groups.length && (
          <Text style={s.small}>
            Create your first circle and invite your people.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

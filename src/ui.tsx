import React from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import type { ViewStyle, TextStyle, TextInputProps } from "react-native";
import {
  ArrowUpRight,
  ArrowRight,
  LockKeyhole,
  Users,
  Palette,
  Blocks,
  BookOpen,
  Check,
  LoaderCircle,
} from "lucide-react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { Button, ButtonText } from "../components/ui/button";
import { Input, InputField } from "../components/ui/input";
import { colors as c, tones, fonts, s } from "./theme";
import type { User, Group } from "./types";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[s.row, { gap: 10 }]}>
      <Svg
        width={compact ? 29 : 34}
        height={compact ? 29 : 34}
        viewBox="0 0 36 36"
        fill="none"
      >
        <Path
          d="M10.8 18.6C5 10.8 6.8 3 10.2 3c3.2 0 5.7 7.4 6.2 13.7C17.6 7.9 21.6 2.5 24.3 4c3 1.6 1.7 9.3-3.2 15.2 5.9.9 9.1 4.5 8.3 8.5-.8 4-5.2 5.9-12.1 5.3C9 32.3 5.8 29.4 6.8 25c.6-2.7 2-4.9 4-6.4Z"
          fill={c.green}
        />
        <Circle cx="22.6" cy="24.7" r="1.4" fill="#F3F5E8" />
      </Svg>
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: compact ? 25 : 30,
          color: c.green,
          letterSpacing: -1.5,
        }}
      >
        rabbit<Text style={{ color: "#90A377" }}>.</Text>
      </Text>
    </View>
  );
}
export function Avatar({ user, size = 34 }: { user?: User; size?: number }) {
  const tone = tones[user?.color ?? "sage"] ?? tones.sage;
  const initials = (user?.name ?? "You")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.semibold,
          fontSize: size * 0.32,
          color: tone.ink,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}
export function GroupIcon({
  group,
  size = 38,
}: {
  group: Pick<Group, "color" | "icon">;
  size?: number;
}) {
  const tone = tones[group.color] ?? tones.sage;
  const Icon =
    group.icon === "palette"
      ? Palette
      : group.icon === "blocks"
        ? Blocks
        : group.icon === "book"
          ? BookOpen
          : Users;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 11,
        backgroundColor: tone.bg,
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.46} color={tone.ink} strokeWidth={1.7} />
    </View>
  );
}
export function Action({
  children,
  onPress,
  icon: Icon,
  secondary = false,
  disabled = false,
  loading = false,
  label,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  icon?: any;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  style?: ViewStyle;
}) {
  return (
    <Button
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={disabled || loading}
      variant={secondary ? "outline" : "default"}
      style={[
        {
          minHeight: 44,
          borderRadius: 9,
          paddingHorizontal: 18,
          gap: 9,
          backgroundColor: secondary ? "transparent" : c.green,
          borderColor: c.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <ButtonText
        style={{
          fontFamily: fonts.medium,
          fontSize: 13,
          color: secondary ? c.ink : "white",
        }}
      >
        {loading ? "One moment…" : children}
      </ButtonText>
      {Icon && !loading && (
        <Icon size={16} color={secondary ? c.ink : "white"} strokeWidth={1.8} />
      )}
    </Button>
  );
}
export function IconButton({
  icon: Icon,
  onPress,
  label,
  size = 18,
  style,
  color = c.muted,
}: {
  icon: any;
  onPress: () => void;
  label: string;
  size?: number;
  style?: ViewStyle;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        {
          height: 44,
          width: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor: hovered || pressed ? c.greenLight : "transparent",
        },
        style,
      ]}
    >
      <Icon size={size} color={color} strokeWidth={1.7} />
    </Pressable>
  );
}
export function Chip({
  children,
  active = false,
  onPress,
  icon: Icon,
  style,
}: {
  children: React.ReactNode;
  active?: boolean;
  onPress?: () => void;
  icon?: any;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered }: any) => [
        s.row,
        {
          gap: 6,
          paddingHorizontal: 13,
          minHeight: 36,
          borderRadius: 7,
          backgroundColor: active
            ? c.greenLight
            : hovered
              ? "#F0F3E9"
              : "transparent",
          borderWidth: 1,
          borderColor: active ? "#D3DEC8" : c.border,
        },
        style,
      ]}
    >
      {Icon && <Icon size={14} color={active ? c.green : c.muted} />}
      <Text
        style={{
          fontFamily: active ? fonts.medium : fonts.regular,
          fontSize: 12,
          color: active ? c.green : c.muted,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <Input
        style={{
          minHeight: 48,
          borderRadius: 9,
          backgroundColor: c.paper,
          borderColor: c.border,
        }}
      >
        <InputField
          aria-label={props.accessibilityLabel ?? label}
          placeholderTextColor={c.muted}
          {...props}
          style={[
            {
              fontFamily: fonts.regular,
              fontSize: 14,
              color: c.ink,
              paddingVertical: 12,
            },
            props.style,
          ]}
        />
      </Input>
    </View>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={{ padding: 32, alignItems: "center", gap: 12 }}>
      <View
        style={{ backgroundColor: c.greenLight, borderRadius: 16, padding: 15 }}
      >
        <BookOpen color={c.green} size={25} strokeWidth={1.5} />
      </View>
      <Text style={[s.h2, { textAlign: "center", fontSize: 18 }]}>{title}</Text>
      <Text
        style={[s.text, { textAlign: "center", color: c.muted, maxWidth: 320 }]}
      >
        {body}
      </Text>
      {action}
    </View>
  );
}
export function Privacy({
  text = "Private by design. Shared by choice.",
}: {
  text?: string;
}) {
  return (
    <View style={[s.row, { gap: 6, justifyContent: "center" }]}>
      <LockKeyhole size={12} color={c.muted} />
      <Text style={[s.small, { fontSize: 11 }]}>{text}</Text>
    </View>
  );
}

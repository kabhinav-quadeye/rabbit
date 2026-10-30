import { StyleSheet, Platform } from "react-native";
export const colors = {
  bg: "#F8F9F4",
  paper: "#FFFFFF",
  ink: "#27332D",
  muted: "#6D756E",
  faint: "#92998F",
  green: "#2F5843",
  greenLight: "#E8EEE1",
  border: "#E5E8DE",
  sidebar: "#F1F3EB",
  peach: "#F6E8DD",
  lavender: "#ECE8F4",
  sage: "#E4ECDD",
  blue: "#E5EDF3",
  sand: "#F3EEDA",
  error: "#A63B31",
};
export const tones: Record<string, { bg: string; ink: string }> = {
  sage: { bg: colors.sage, ink: "#4F6945" },
  peach: { bg: colors.peach, ink: "#99643F" },
  lavender: { bg: colors.lavender, ink: "#776196" },
  blue: { bg: colors.blue, ink: "#4F6C89" },
  sand: { bg: colors.sand, ink: "#8E7839" },
};
export const fonts = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};
export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  text: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
  },
  small: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  h2: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  field: {
    fontFamily: fonts.regular,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    backgroundColor: colors.paper,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.error,
    lineHeight: 20,
  },
});

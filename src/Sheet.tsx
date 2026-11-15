import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";
import { colors as c, s } from "./theme";
import { IconButton } from "./ui";
export function Sheet({
  title,
  children,
  onClose,
  closeLabel = "Close dialog",
  wide = false,
  placement = "center",
  header,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  wide?: boolean;
  /** center: dialog; bottom: phone sheet rising from below; side: right-anchored panel. */
  placement?: "center" | "bottom" | "side";
  /** Replaces the visible heading; `title` still names the dialog for assistive tech. */
  header?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const bottom = placement === "bottom",
    side = placement === "side";
  return (
    <Modal
      transparent
      visible
      animationType={bottom ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: bottom ? "flex-end" : "center",
          alignItems: side ? "flex-end" : "center",
          padding: bottom || side ? 0 : width < 600 ? 12 : 32,
        }}
      >
        <Pressable
          accessibilityLabel="Dismiss dialog"
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(29,42,31,0.35)",
          }}
        />
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-label={title}
          aria-modal={true}
          style={[
            s.card,
            bottom
              ? {
                  width: "100%",
                  maxHeight: height * 0.92,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  borderTopLeftRadius: 18,
                  borderTopRightRadius: 18,
                }
              : side
                ? {
                    width: Math.min(420, width),
                    height: "100%",
                    borderRadius: 0,
                    borderTopLeftRadius: 18,
                    borderBottomLeftRadius: 18,
                  }
                : {
                    width: "100%",
                    maxWidth: wide ? 740 : 520,
                    maxHeight: height - 48,
                    borderRadius: 18,
                  },
          ]}
        >
          {bottom && (
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#D6DAD0",
                alignSelf: "center",
                marginTop: 8,
              }}
            />
          )}
          <View
            style={[
              s.between,
              {
                paddingLeft: 24,
                paddingRight: 12,
                paddingVertical: header ? 4 : 10,
                borderBottomWidth: header ? 0 : 1,
                borderColor: c.border,
              },
            ]}
          >
            {header ? (
              <View style={{ flex: 1, minWidth: 0 }}>{header}</View>
            ) : (
              <Text accessibilityRole="header" style={s.h2}>
                {title}
              </Text>
            )}
            <IconButton icon={X} label={closeLabel} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 24,
              paddingTop: header ? 4 : 24,
            }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

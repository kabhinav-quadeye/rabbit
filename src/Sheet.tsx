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
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  wide?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: width < 600 ? 12 : 32,
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
            {
              width: "100%",
              maxWidth: wide ? 740 : 520,
              maxHeight: height - 48,
              borderRadius: 18,
            },
          ]}
        >
          <View
            style={[
              s.between,
              {
                paddingLeft: 24,
                paddingRight: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderColor: c.border,
              },
            ]}
          >
            <Text accessibilityRole="header" style={s.h2}>
              {title}
            </Text>
            <IconButton icon={X} label={closeLabel} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

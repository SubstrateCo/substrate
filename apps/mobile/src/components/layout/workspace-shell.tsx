import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, PanResponder, Platform, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  Building2,
  CheckCheck,
  ChevronLeft,
  ChevronDown,
  Menu,
  MessageSquare,
  Moon,
  Sun,
  Users,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { SafeAreaView } from "react-native-safe-area-context";

export type WorkspaceTab = "messages" | "tasks" | "crm";

const tabs = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "tasks", label: "Tasks", icon: CheckCheck },
  { id: "crm", label: "CRM", icon: Building2 },
] as const;

type WorkspaceShellProps = {
  workspaceName: string;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  onOpenConversations: () => void;
  onWorkspaceMenu: () => void;
  blocked?: boolean;
  tasksEnabled?: boolean;
  crmEnabled?: boolean;
  onBack?: () => void;
  children: ReactNode;
};

export function WorkspaceShell({
  workspaceName,
  tab,
  onTab,
  onOpenConversations,
  onWorkspaceMenu,
  blocked = false,
  tasksEnabled = true,
  crmEnabled = true,
  onBack,
  children,
}: WorkspaceShellProps) {
  const theme = useColorScheme();
  const colorScheme = theme.colorScheme;
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const drawerGesture = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      tab === "messages" && gesture.x0 <= 24 && gesture.dx > 14 && Math.abs(gesture.dy) < 16,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > 40) onOpenConversations();
    },
  });

  return (
    <SafeAreaView
      className="flex-1 bg-surface"
      testID="app-shell"
      importantForAccessibility={blocked ? "no-hide-descendants" : "auto"}
      accessibilityElementsHidden={blocked}
      {...drawerGesture.panHandlers}
    >
      <View className="h-14 flex-row items-center border-b border-border px-2">
        {onBack && (
          <Button variant="ghost" size="icon" onPress={onBack} accessibilityLabel="Back">
            <Icon as={ChevronLeft} className="size-5 text-foreground" />
          </Button>
        )}
        {tab === "messages" && (
          <Button
            variant="ghost"
            size="icon"
            className="size-12"
            onPress={onOpenConversations}
            accessibilityLabel="Open channels and direct messages"
            testID="open-conversations"
          >
            <Icon as={Menu} className="size-5 text-foreground" />
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-12 flex-1 flex-row justify-start gap-2 px-2"
          onPress={onWorkspaceMenu}
          accessibilityLabel={`Workspace: ${workspaceName}`}
          testID="workspace-menu"
        >
          <Text className="text-base font-semibold" numberOfLines={1}>
            {workspaceName}
          </Text>
          <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          onPress={() => theme.setColorScheme(colorScheme === "dark" ? "light" : "dark")}
          accessibilityLabel={colorScheme === "dark" ? "Use light theme" : "Use dark theme"}
          testID="theme-toggle"
        >
          <Icon as={colorScheme === "dark" ? Sun : Moon} className="size-5 text-muted-foreground" />
        </Button>
      </View>
      <View className="flex-1">{children}</View>
      {!keyboardVisible && (
        <View className="flex-row border-t border-border bg-surface px-2 py-1">
          {tabs.flatMap((item) => {
            if (item.id === "tasks" && !tasksEnabled) return [];
            const label = item.id === "crm" && !crmEnabled ? "People" : item.label;
            const icon = item.id === "crm" && !crmEnabled ? Users : item.icon;
            return [
              <Button
                key={item.id}
                variant="ghost"
                className="h-14 flex-1 flex-col gap-1 rounded-lg"
                onPress={() => onTab(item.id)}
                accessibilityLabel={label}
                role="tab"
                accessibilityState={{ selected: tab === item.id }}
                testID={`nav-${item.id}`}
              >
                <Icon
                  as={icon}
                  className={
                    tab === item.id ? "size-5 text-primary" : "size-5 text-muted-foreground"
                  }
                />
                <Text
                  className={
                    tab === item.id
                      ? "text-xs font-medium text-primary"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {label}
                </Text>
              </Button>,
            ];
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

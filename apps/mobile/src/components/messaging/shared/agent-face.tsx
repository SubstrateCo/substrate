import { decodeAvatarCode, type AmbientLevel } from "@substrate/agent-avatars/config";
import { AgentAvatar } from "@substrate/agent-avatars/native";

import { View } from "react-native";

import { AVATAR_SIZES, type AvatarSize } from "./avatar-size";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme";
import { Bot } from "lucide-react-native";

/** Small avatars stay still unless asked; rows only wink and glance; headers move freely. */
const DEFAULT_AMBIENT: Record<AvatarSize, AmbientLevel> = {
  sm: "off",
  md: "subtle",
  lg: "lively",
};

/**
 * Theme props for any agent avatar: the shared outline token (clear in light mode, a soft edge in
 * dark mode so dark bodies stay visible), and the sleep and thinking marks in the app's muted
 * text colour. They follow the app's theme choice, not only the system one.
 */
export function useAgentAvatarTheme() {
  const { colors } = useTheme();
  return { outline: colors["agent-avatar-outline"], markColor: colors["muted-foreground"] };
}

/**
 * An agent's animated avatar, drawn from its stored look code. It is not cropped to a circle,
 * so the whole body shows. A missing or unreadable code shows a plain agent mark.
 */
export function AgentFace({
  name,
  code,
  size = "md",
  ambient = DEFAULT_AMBIENT[size],
}: {
  name: string;
  code: string | null;
  size?: AvatarSize;
  ambient?: AmbientLevel;
}) {
  const { px, box } = AVATAR_SIZES[size];
  const theme = useAgentAvatarTheme();
  const look = code ? decodeAvatarCode(code) : null;
  if (!look) {
    return (
      <View
        className={cn(box, "items-center justify-center rounded-md bg-muted")}
        accessibilityLabel={name}
        accessibilityRole="image"
      >
        <Icon as={Bot} className="size-4 text-muted-foreground" />
      </View>
    );
  }
  return (
    <View className={cn(box, "items-center justify-center")}>
      <AgentAvatar {...look} {...theme} size={px} ambient={ambient} animated label={name} />
    </View>
  );
}

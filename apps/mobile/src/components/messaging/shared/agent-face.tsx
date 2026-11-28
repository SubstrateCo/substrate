import { decodeAvatarCode, type AmbientLevel } from "@substrate/agent-avatars/config";
import { AgentAvatar } from "@substrate/agent-avatars/native";

import { View } from "react-native";

import { AVATAR_SIZES, type AvatarSize } from "./avatar-size";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme";
import { Bot } from "lucide-react-native";

const DEFAULT_AMBIENT: Record<AvatarSize, AmbientLevel> = {
  sm: "off",
  md: "subtle",
  lg: "lively",
};

export function useAgentAvatarTheme() {
  const { colors } = useTheme();
  return { outline: colors["agent-avatar-outline"], markColor: colors["muted-foreground"] };
}

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

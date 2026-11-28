import { memo } from "react";
import { View } from "react-native";

import { AgentAvatar as DomAgentAvatar } from "../../react/agent-avatar.tsx";
import { useMarkColor, type NativeAgentAvatarProps } from "../props.ts";

function WebAgentAvatarView({ style, markColor, size = 32, ...props }: NativeAgentAvatarProps) {
  const color = useMarkColor(markColor);
  return (
    <View style={[{ width: size, height: size, flexShrink: 0 }, style]}>
      <DomAgentAvatar {...props} size={size} style={{ color }} />
    </View>
  );
}

export const AgentAvatar = memo(WebAgentAvatarView);

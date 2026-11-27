import { memo } from "react";
import { View } from "react-native";

import { AgentAvatar as DomAgentAvatar } from "../../react/agent-avatar.tsx";
import { useMarkColor, type NativeAgentAvatarProps } from "../props.ts";

/**
 * On react-native-web the DOM renderer draws the avatar. It writes SVG attributes directly,
 * which is cheaper than rendering through React, and it pauses avatars that are off screen.
 */
function WebAgentAvatarView({ style, markColor, size = 32, ...props }: NativeAgentAvatarProps) {
  const color = useMarkColor(markColor);
  return (
    <View style={[{ width: size, height: size, flexShrink: 0 }, style]}>
      <DomAgentAvatar {...props} size={size} style={{ color }} />
    </View>
  );
}

export const AgentAvatar = memo(WebAgentAvatarView);

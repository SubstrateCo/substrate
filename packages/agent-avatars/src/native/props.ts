import type { Ref } from "react";
import { useColorScheme, type StyleProp, type ViewStyle } from "react-native";

import type { AmbientLevel, Mood, World } from "../config/presets.ts";
import type { AvatarConfig } from "../config/resolve.ts";
import type { AgentAvatarHandle } from "../render/hooks.ts";

export interface NativeAgentAvatarProps extends Partial<AvatarConfig> {
  mood?: Mood;
  /** `floor` stands it on a surface with a shadow; `space` floats it in 3D. */
  world?: World;
  /** Unprompted actions: `lively` spins and flies, `subtle` only winks and glances, `off` none. */
  ambient?: AmbientLevel;
  /** Width and height in px. */
  size?: number;
  /** `false` holds a still pose. Reduced motion does the same. */
  animated?: boolean;
  /** A tap pokes it, and stroking it back and forth makes it happy. */
  interactive?: boolean;
  /**
   * While waiting, ms of inactivity before it gets drowsy. 0 never sleeps. On iOS and Android,
   * activity is the app coming to the foreground or a touch on any avatar; other touches in the
   * app do not count. On web it is any page activity.
   */
  sleepAfter?: number;
  /** Ms it stays drowsy before it falls asleep. */
  drowsyFor?: number;
  /** Chatter as if talking, for example while a reply streams in. */
  speaking?: boolean;
  /** Speech loudness from 0 to 1, for example from text-to-speech audio. */
  level?: number;
  /** A thin edge for dark backgrounds: `true` or any colour. */
  outline?: boolean | string;
  /** Colour of the `z`, `?` and `!` marks. Defaults to a grey that suits the colour scheme. */
  markColor?: string;
  /** Accessible name. Without it the avatar is hidden from accessibility services. */
  label?: string;
  /** Desynchronises blinks and glances. Defaults to a per-instance id. */
  seed?: string | number;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<AgentAvatarHandle>;
}

export const DEFAULT_OUTLINE = "rgba(255, 255, 255, 0.32)";

export function useMarkColor(markColor: string | undefined): string {
  const scheme = useColorScheme();
  return markColor ?? (scheme === "dark" ? "#d4d4d8" : "#52525b");
}

import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  type Ref,
  type RefObject,
} from "react";

import type { AmbientLevel, Gesture, Mood, World } from "../config/presets.ts";
import { resolveConfig, resolvePalette, type AvatarConfig } from "../config/resolve.ts";
import type { AvatarController } from "../motion/controller.ts";
import { controllerInput } from "./input.ts";

export interface AgentAvatarHandle {
  /** Plays a gesture once, on top of the mood. */
  play(gesture: Gesture): void;
  /** Reacts as if poked in the middle. */
  poke(): void;
}

export interface AvatarModelProps extends Partial<AvatarConfig> {
  mood?: Mood;
  world?: World;
  ambient?: AmbientLevel;
  animated?: boolean;
  sleepAfter?: number;
  drowsyFor?: number;
  speaking?: boolean;
  level?: number;
}

export function useAvatarModel(props: AvatarModelProps, reducedMotion: boolean) {
  const { body, color, secondaryColor, fill, eyes, eyeColor, level } = props;
  const { mood = "waiting", world = "floor", ambient = "lively", animated = true } = props;
  const { sleepAfter = 0, drowsyFor = 8000, speaking = false } = props;
  const config = useMemo(
    () => resolveConfig({ body, color, secondaryColor, fill, eyes, eyeColor }),
    [body, color, secondaryColor, fill, eyes, eyeColor],
  );
  const palette = useMemo(() => resolvePalette(config), [config]);
  const input = useMemo(
    () =>
      controllerInput({
        reducedMotion,
        mood,
        body: config.body,
        eyes: config.eyes,
        world,
        ambient,
        sleepAfter,
        drowsyFor,
        speaking,
        level,
      }),
    [
      reducedMotion,
      mood,
      config.body,
      config.eyes,
      world,
      ambient,
      sleepAfter,
      drowsyFor,
      speaking,
      level,
    ],
  );
  const reactId = useId();
  const id = `agent-avatar-${reactId.replace(/[^\w-]/g, "")}`;
  return { palette, input, id, live: animated && !reducedMotion };
}

export function useControllerSync(
  ref: Ref<AgentAvatarHandle> | undefined,
  controller: RefObject<AvatarController | null>,
  refresh: RefObject<(() => void) | null>,
  model: ReturnType<typeof useAvatarModel>,
) {
  const { input, live } = model;
  useLayoutEffect(() => {
    controller.current?.update(input, performance.now());
    refresh.current?.();
  }, [controller, refresh, input, live]);

  useImperativeHandle(
    ref,
    () => ({
      play: (gesture) => controller.current?.play(gesture, performance.now()),
      poke: () => controller.current?.poke(0, 0, performance.now()),
    }),
    [controller],
  );
}

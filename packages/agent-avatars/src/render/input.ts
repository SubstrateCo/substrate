import {
  AMBIENT_LEVELS,
  MOODS,
  WORLDS,
  type AmbientLevel,
  type AvatarBody,
  type EyeStyle,
  type Mood,
  type World,
} from "../config/presets.ts";
import type { ControllerInput } from "../motion/controller.ts";

interface InputOptions {
  mood: Mood;
  body: AvatarBody;
  eyes: EyeStyle;
  world: World;
  ambient: AmbientLevel;
  sleepAfter: number;
  drowsyFor: number;
  speaking: boolean;
  level: number | undefined;
  reducedMotion: boolean;
}

/** Turns component props into controller input. Every renderer uses it, so they behave alike. */
export function controllerInput(options: InputOptions): ControllerInput {
  return {
    // Reduced motion holds the waiting pose whatever the mood.
    mood: !options.reducedMotion && MOODS.includes(options.mood) ? options.mood : "waiting",
    body: options.body,
    eyes: options.eyes,
    world: WORLDS.includes(options.world) ? options.world : "floor",
    ambient: AMBIENT_LEVELS.includes(options.ambient) ? options.ambient : "lively",
    sleepAfter: options.sleepAfter,
    drowsyFor: options.drowsyFor,
    speaking: options.speaking,
    level: options.level ?? null,
  };
}

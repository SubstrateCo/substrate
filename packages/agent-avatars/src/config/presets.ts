export const BODIES = ["circle", "squircle", "pill", "blob", "drop", "hexagon"] as const;
export type AvatarBody = (typeof BODIES)[number];

export const EYE_STYLES = ["round", "tall", "wide", "dot", "square", "curious"] as const;
export type EyeStyle = (typeof EYE_STYLES)[number];

export const FILLS = ["gradient", "solid"] as const;
export type AvatarFill = (typeof FILLS)[number];

export const MOODS = [
  "waiting",
  "listening",
  "thinking",
  "working",
  "searching",
  "reading",
  "writing",
  "focused",
  "happy",
  "love",
  "surprised",
  "confused",
  "sorry",
  "dizzy",
  "drowsy",
  "asleep",
] as const;
export type Mood = (typeof MOODS)[number];

export const GESTURES = [
  "nod",
  "shake",
  "wink",
  "jump",
  "wiggle",
  "peek",
  "spin",
  "bounce",
  "flip",
  "swoop",
  "orbit",
] as const;
export type Gesture = (typeof GESTURES)[number];

/** `floor` stands the avatar on a surface with a shadow; `space` floats it in 3D. */
export const WORLDS = ["floor", "space"] as const;
export type World = (typeof WORLDS)[number];

/**
 * How much the avatar does unprompted: `lively` spins and flies, `subtle` only winks, glances
 * and nods (good for dense lists), `off` does nothing it is not asked to.
 */
export const AMBIENT_LEVELS = ["lively", "subtle", "off"] as const;
export type AmbientLevel = (typeof AMBIENT_LEVELS)[number];

export const BODY_COLOR_NAMES = [
  "slate",
  "ink",
  "ocean",
  "teal",
  "moss",
  "lemon",
  "sunset",
  "rose",
  "plum",
  "clay",
  "cloud",
] as const;
export type BodyColorName = (typeof BODY_COLOR_NAMES)[number];

export interface BodyColor {
  from: string;
  to: string;
  solid: string;
}

/** Body colours. `from` and `to` make the gradient; `solid` is the flat fill. */
export const BODY_COLORS: Record<BodyColorName, BodyColor> = {
  slate: { from: "#6b7c92", to: "#2a3646", solid: "#3d4b5e" },
  ink: { from: "#45454d", to: "#0c0c10", solid: "#1d1d22" },
  ocean: { from: "#5cb8ff", to: "#1d47c9", solid: "#2f6fe4" },
  teal: { from: "#4fe0c2", to: "#0b7480", solid: "#16a39a" },
  moss: { from: "#a9d86e", to: "#336d2c", solid: "#5c9a3f" },
  lemon: { from: "#ffe98a", to: "#f0a021", solid: "#f7c440" },
  sunset: { from: "#ffb35c", to: "#e8406a", solid: "#f4725c" },
  rose: { from: "#ffa6c9", to: "#d93a78", solid: "#ec6a9e" },
  plum: { from: "#c09cff", to: "#5b34c9", solid: "#8458e6" },
  clay: { from: "#eda67c", to: "#a34724", solid: "#c96c42" },
  cloud: { from: "#ffffff", to: "#cfd5e2", solid: "#eef1f6" },
};

export const EYE_COLOR_NAMES = ["white", "cream", "mint", "sky", "amber", "ink"] as const;
export type EyeColorName = (typeof EYE_COLOR_NAMES)[number];

export const EYE_COLORS: Record<EyeColorName, string> = {
  white: "#ffffff",
  cream: "#fff3d6",
  mint: "#c8ffe8",
  sky: "#d2eaff",
  amber: "#ffd166",
  ink: "#15171c",
};

export function isBodyColorName(value: string): value is BodyColorName {
  return BODY_COLOR_NAMES.some((name) => name === value);
}

export function isEyeColorName(value: string): value is EyeColorName {
  return EYE_COLOR_NAMES.some((name) => name === value);
}

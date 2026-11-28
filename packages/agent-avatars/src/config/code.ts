import { contrast } from "../color/color.ts";
import {
  BODIES,
  BODY_COLOR_NAMES,
  EYE_COLOR_NAMES,
  EYE_STYLES,
  FILLS,
  type AvatarBody,
  type BodyColorName,
} from "./presets.ts";
import { eyeSurfaceColors, resolvePalette, type AvatarConfig } from "./resolve.ts";

/**
 * A look stored as a short code: a version character, then one base-36 character per choice,
 * each an index into a preset list. Example: `1a3f0c`.
 *
 * | Position | Choice     | List               |
 * | -------- | ---------- | ------------------ |
 * | 0        | version    | always `1`         |
 * | 1        | body       | `BODIES`           |
 * | 2        | colour     | `BODY_COLOR_NAMES` |
 * | 3        | fill       | `FILLS`            |
 * | 4        | eyes       | `EYE_STYLES`       |
 * | 5        | eye colour | `EYE_COLOR_NAMES`  |
 *
 * Stored codes keep their meaning forever: only append to these lists, never reorder or
 * remove entries. A new layout needs a new version character.
 */
export const AVATAR_CODE_PATTERN = /^1[0-9a-z]{5}$/;

function digit(list: readonly string[], value: string): string {
  const index = list.indexOf(value);
  if (index < 0) throw new Error(`"${value}" is not a preset and cannot be stored in a code.`);
  return index.toString(36);
}

function at<T>(list: readonly T[], code: string, position: number): T | undefined {
  return list[Number.parseInt(code.charAt(position), 36)];
}

/** Encodes a look made only of presets (no custom hex colours). */
export function encodeAvatarCode(config: AvatarConfig): string {
  return `1${digit(BODIES, config.body)}${digit(BODY_COLOR_NAMES, config.color)}${digit(FILLS, config.fill)}${digit(EYE_STYLES, config.eyes)}${digit(EYE_COLOR_NAMES, config.eyeColor)}`;
}

/** The look a code stores, or null when the code is malformed or names an unknown preset. */
export function decodeAvatarCode(code: string): AvatarConfig | null {
  if (!AVATAR_CODE_PATTERN.test(code)) return null;
  const body = at(BODIES, code, 1);
  const color = at(BODY_COLOR_NAMES, code, 2);
  const fill = at(FILLS, code, 3);
  const eyes = at(EYE_STYLES, code, 4);
  const eyeColor = at(EYE_COLOR_NAMES, code, 5);
  return complete({ body, color, fill, eyes, eyeColor });
}

function complete(look: Partial<AvatarConfig>): AvatarConfig | null {
  const { body, color, fill, eyes, eyeColor } = look;
  if (!body || !color) return null;
  if (!fill || !eyes || !eyeColor) return null;
  return { body, color, fill, eyes, eyeColor };
}

export function isAvatarCode(value: string): boolean {
  return decodeAvatarCode(value) !== null;
}

function eyesReadable(config: AvatarConfig): boolean {
  const eye = resolvePalette(config).eye;
  return eyeSurfaceColors(config).every((surface) => contrast(eye, surface) >= 3);
}

export interface AvatarChoices {
  body?: AvatarBody;
  color?: BodyColorName;
}

/**
 * Applies a person's choices to a stored look and returns the new code. When a new colour
 * would hide the eyes, the eyes take the first readable eye colour, so every device computes
 * the same code.
 */
export function withAvatarChoices(code: string, choices: AvatarChoices): string | null {
  const current = decodeAvatarCode(code);
  if (!current) return null;
  const next: AvatarConfig = {
    ...current,
    body: choices.body ?? current.body,
    color: choices.color ?? current.color,
  };
  if (!eyesReadable(next)) {
    next.eyeColor =
      EYE_COLOR_NAMES.find((name) => eyesReadable({ ...next, eyeColor: name })) ?? "ink";
  }
  return encodeAvatarCode(next);
}

import { HEX_COLOR, mix } from "../color/color.ts";
import {
  BODIES,
  BODY_COLOR_NAMES,
  BODY_COLORS,
  EYE_COLOR_NAMES,
  EYE_COLORS,
  EYE_STYLES,
  FILLS,
  isBodyColorName,
  isEyeColorName,
  type BodyColor,
} from "./presets.ts";
import { z } from "zod";

const hexColor = z.string().regex(HEX_COLOR);

/**
 * Avatar settings. Parse stored or user-supplied settings with this schema: unknown values fall
 * back to the defaults, so a bad setting never breaks rendering.
 */
export const avatarConfigSchema = z.object({
  body: z.enum(BODIES).catch("squircle"),
  /** A `BODY_COLORS` name or a hex colour. */
  color: z.union([z.enum(BODY_COLOR_NAMES), hexColor]).catch("slate"),
  /** With a hex `color` and a gradient fill, the colour the gradient ends on. */
  secondaryColor: hexColor.optional().catch(undefined),
  fill: z.enum(FILLS).catch("gradient"),
  eyes: z.enum(EYE_STYLES).catch("tall"),
  /** An `EYE_COLORS` name or a hex colour. */
  eyeColor: z.union([z.enum(EYE_COLOR_NAMES), hexColor]).catch("white"),
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_CONFIG: AvatarConfig = avatarConfigSchema.parse({});

/** Fills in defaults and drops invalid values. */
export function resolveConfig(input: Partial<AvatarConfig>): AvatarConfig {
  return avatarConfigSchema.parse(input);
}

export interface Palette {
  /** Gradient start (top left). */
  from: string;
  /** Gradient end (bottom right). */
  to: string;
  /** Terminator and rim shading. */
  shade: string;
  /** Light bounced up from the floor. */
  bounce: string;
  eye: string;
  eyeShade: string;
}

function bodyColors(config: AvatarConfig): BodyColor {
  if (isBodyColorName(config.color)) return BODY_COLORS[config.color];
  const end = config.secondaryColor ?? mix(config.color, "#000000", 0.42);
  return { from: mix(config.color, "#ffffff", 0.18), to: end, solid: config.color };
}

export function resolvePalette(config: AvatarConfig): Palette {
  const body = bodyColors(config);
  const solid = config.fill === "solid";
  const from = solid ? body.solid : body.from;
  const to = solid ? body.solid : body.to;
  const eye = isEyeColorName(config.eyeColor) ? EYE_COLORS[config.eyeColor] : config.eyeColor;
  return {
    from,
    to,
    shade: mix(to, "#000000", 0.55),
    bounce: mix(from, "#ffffff", 0.35),
    eye,
    eyeShade: mix(eye, "#000000", 0.14),
  };
}

/**
 * The colours under the eyes, for contrast checks. The eyes sit across the middle of the
 * gradient, not on its ends.
 */
export function eyeSurfaceColors(config: AvatarConfig): string[] {
  const palette = resolvePalette(config);
  return [0.3, 0.5, 0.65].map((share) => mix(palette.from, palette.to, share));
}

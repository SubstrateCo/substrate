import { contrast, hslToHex } from "../color/color.ts";
import { encodeAvatarCode } from "./code.ts";
import {
  BODY_COLOR_NAMES,
  EYE_COLOR_NAMES,
  EYE_COLORS,
  EYE_STYLES,
  BODIES,
  type AvatarBody,
  type BodyColorName,
  type EyeStyle,
} from "./presets.ts";
import { eyeSurfaceColors, type AvatarConfig } from "./resolve.ts";

/** A 32-bit hash of a string or number (cyrb-style mixing). */
export function hashSeed(seed: string | number): number {
  const text = String(seed);
  let h1 = 0xde_ad_be_ef;
  let h2 = 0x41_c6_ce_57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2_654_435_761);
    h2 = Math.imul(h2 ^ code, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  return h1 >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface GenerateOptions {
  bodies?: readonly AvatarBody[];
  colors?: readonly BodyColorName[];
  eyes?: readonly EyeStyle[];
  /** Share of avatars that get an invented colour instead of a preset, from 0 to 1. */
  customColorShare?: number;
}

const MIN_EYE_CONTRAST = 3;

function pick<T>(random: () => number, list: readonly T[]): T {
  const item = list[Math.floor(random() * list.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list.");
  return item;
}

function inventedColors(random: () => number) {
  const hue = random() * 360;
  const shift = (random() < 0.5 ? -1 : 1) * (25 + random() * 35);
  return {
    color: hslToHex(hue, 0.72, 0.6),
    secondaryColor: hslToHex((hue + shift + 360) % 360, 0.68, 0.38),
  };
}

function readableEyeColor(random: () => number, config: AvatarConfig): string {
  const surfaces = eyeSurfaceColors(config);
  const score = (eye: string) => Math.min(...surfaces.map((surface) => contrast(eye, surface)));
  const names = EYE_COLOR_NAMES;
  const readable = names.filter((name) => score(EYE_COLORS[name]) >= MIN_EYE_CONTRAST);
  if (readable.length > 0) return pick(random, readable);
  return names.reduce((best, name) =>
    score(EYE_COLORS[name]) > score(EYE_COLORS[best]) ? name : best,
  );
}

/**
 * A look picked from a seed, such as an agent id or name. The same seed always gives the same
 * avatar, and the eyes always stay readable on the body.
 */
export function generateAvatar(seed: string | number, options: GenerateOptions = {}) {
  const random = seededRandom(hashSeed(seed));
  const colors = options.colors ?? BODY_COLOR_NAMES;
  const config: AvatarConfig = {
    body: pick(random, options.bodies ?? BODIES),
    color: pick(random, colors),
    fill: random() < 0.78 ? "gradient" : "solid",
    eyes: pick(random, options.eyes ?? EYE_STYLES),
    eyeColor: "white",
  };
  if (random() < (options.customColorShare ?? 0.3)) Object.assign(config, inventedColors(random));
  config.eyeColor = readableEyeColor(random, config);
  return config;
}

/** Choices a person can make for an agent's look. Unset choices keep the generated look. */
export interface AgentLookChoices {
  body?: AvatarBody | null;
  color?: BodyColorName | null;
}

/**
 * An agent's look: generated from its id, with the body and colour the owner chose. Agent
 * colours are always presets, so a settings screen can show the current choice.
 */
export function agentAvatarLook(seed: string, choices: AgentLookChoices = {}): AvatarConfig {
  const generated = generateAvatar(seed, { customColorShare: 0 });
  const config: AvatarConfig = {
    ...generated,
    body: choices.body ?? generated.body,
    color: choices.color ?? generated.color,
  };
  if (config.color !== generated.color) {
    config.eyeColor = readableEyeColor(seededRandom(hashSeed(`${seed}:eyes`)), config);
  }
  return config;
}

/** The stored code for a new agent: its generated look, fixed from then on. */
export function generateAvatarCode(seed: string): string {
  return encodeAvatarCode(agentAvatarLook(seed));
}

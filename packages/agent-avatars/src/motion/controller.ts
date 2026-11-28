import { seededRandom } from "../config/generate.ts";
import type { AmbientLevel, AvatarBody, EyeStyle, Mood, World } from "../config/presets.ts";
import { PROFILE_SAMPLES, bodyGeometry, bodyRadii } from "../geometry/bodies.ts";
import { radialPath } from "../geometry/path.ts";
import {
  addFloat,
  ambientDelay,
  pickAmbient,
  transitionMotion,
  type Kick,
} from "./choreography.ts";
import { BODY_RADIUS, buildFrame, type Frame } from "./frame.ts";
import { MOTIONS, type Motion, type MotionParams } from "./gestures.ts";
import { MOOD_TARGETS } from "./moods.ts";
import { createNoise, type Noise } from "./noise.ts";
import {
  NEUTRAL_POSE,
  POSE_KEYS,
  poseRecord,
  type EyeKind,
  type MoodPose,
  type Pose,
} from "./pose.ts";
import { Spring, type SpringConfig } from "./spring.ts";

export interface ControllerInput {
  mood: Mood;
  body: AvatarBody;
  eyes: EyeStyle;
  world: World;
  ambient: AmbientLevel;
  sleepAfter: number;
  drowsyFor: number;
  speaking: boolean;
  level: number | null;
}

export interface Environment {
  lastActivity: number;
  look: { x: number; y: number } | null;
}

type SleepPhase = "awake" | "drowsy" | "asleep";

const SPRINGS: Record<keyof Pose, SpringConfig> = {
  gazeX: { stiffness: 260, damping: 26 },
  gazeY: { stiffness: 260, damping: 26 },
  yaw: { stiffness: 120, damping: 16 },
  pitch: { stiffness: 120, damping: 16 },
  roll: { stiffness: 110, damping: 13 },
  x: { stiffness: 120, damping: 16 },
  hop: { stiffness: 600, damping: 34 },
  z: { stiffness: 60, damping: 11 },
  squashX: { stiffness: 380, damping: 15 },
  squashY: { stiffness: 380, damping: 15 },
  scale: { stiffness: 200, damping: 20 },
  eyeOpen: { stiffness: 400, damping: 36 },
  eyeScale: { stiffness: 300, damping: 20 },
  eyeScaleL: { stiffness: 300, damping: 20 },
  eyeScaleR: { stiffness: 300, damping: 20 },
  lidInner: { stiffness: 220, damping: 28 },
  lidOuter: { stiffness: 220, damping: 28 },
  blush: { stiffness: 40, damping: 12 },
};

const BLINK_MS = 150;
const POKES_FOR_DIZZY = 4;
const POKE_WINDOW_MS = 2500;
const STROKE_FLIPS = 4;
const STROKE_WINDOW_MS = 1200;
const MORPH_DELAY_MS = 330;

interface ActiveMotion {
  name: Motion;
  start: number;
  params: MotionParams;
  requested: boolean;
}

interface Reaction {
  mood: Mood;
  start: number;
  until: number;
}

interface EyeSwap {
  current: EyeKind;
  next: EyeKind | null;
  start: number;
  closeMs: number;
  openedAt: number;
}

export class AvatarController {
  private input: ControllerInput;
  private readonly noise: Noise;
  private readonly random: () => number;
  private readonly springs: Record<keyof Pose, Spring>;
  private mood: Mood;
  private moodStart: number;
  private particleKey: string | null = null;
  private particleStart = 0;
  private sleep: SleepPhase = "awake";
  private motion: ActiveMotion | null = null;
  private reaction: Reaction | null = null;
  private pokes: number[] = [];
  private hover: { x: number; y: number } | null = null;
  private stroke = { lastX: 0, direction: 0, flips: new Array<number>() };
  private nextBlink: number;
  private blinkStart = -Infinity;
  private eyeSwap: EyeSwap;
  private morph: { from: readonly number[]; to: AvatarBody; progress: Spring; startAt: number };
  private nextAmbient: number;
  private readonly floatPhase: number;
  private lastFrame: number | null = null;
  private cachedBody: string | null = null;
  private readonly blobOffset: number;

  constructor(seed: number, input: ControllerInput, now: number) {
    this.input = input;
    this.noise = createNoise(seed % 997);
    this.random = seededRandom(seed);
    this.springs = poseRecord((key) => new Spring(NEUTRAL_POSE[key], SPRINGS[key]));
    this.mood = input.mood;
    this.moodStart = now;
    this.nextBlink = now + 800 + this.random() * 2500;
    this.blobOffset = this.random() * 100;
    this.floatPhase = this.random() * Math.PI * 2;
    this.nextAmbient = now + ambientDelay(input.mood, this.random) * 1000;
    this.eyeSwap = { current: "open", next: null, start: 0, closeMs: 0, openedAt: -Infinity };
    const progress = new Spring(1, { stiffness: 300, damping: 35 });
    this.morph = { from: bodyRadii(input.body, 0), to: input.body, progress, startAt: now };
  }

  get currentMood(): Mood {
    return this.mood;
  }

  update(input: ControllerInput, now: number): void {
    if (input.body !== this.morph.to) {
      this.morph.from = this.currentRadii(now / 1000);
      this.morph.to = input.body;
      this.morph.progress.settle(0);
      this.morph.startAt = now + MORPH_DELAY_MS;
      this.playAuto("turnAround", now);
    }
    if (input.mood !== this.input.mood) {
      const transition = transitionMotion(this.mood, input.mood);
      if (transition) this.playAuto(transition, now);
    }
    this.input = input;
  }

  play(name: Motion, now: number, params: MotionParams = { x: 0, y: 0 }): void {
    this.motion = { name, start: now, params, requested: true };
  }

  private playAuto(name: Motion, now: number): void {
    if (this.motion?.requested) return;
    this.motion = { name, start: now, params: { x: 0, y: 0 }, requested: false };
  }

  private kick({ channel, velocity }: Kick): void {
    this.springs[channel].velocity += velocity;
  }

  poke(x: number, y: number, now: number): void {
    this.pokes = this.pokes.filter((time) => now - time < POKE_WINDOW_MS);
    this.pokes.push(now);
    if (this.pokes.length >= POKES_FOR_DIZZY) {
      this.pokes = [];
      this.reaction = { mood: "dizzy", start: now, until: now + 2600 };
      return;
    }
    this.play("poke", now, { x, y });
    this.kick({ channel: "z", velocity: -1.4 });
    this.kick({ channel: "roll", velocity: x * 2 });
    this.reaction = { mood: "happy", start: now + 450, until: now + 1700 };
  }

  setHover(point: { x: number; y: number } | null, now: number): void {
    if (point && this.hover) this.trackStroke(point.x - this.hover.x, now);
    this.hover = point;
  }

  private trackStroke(dx: number, now: number): void {
    const stroke = this.stroke;
    stroke.lastX += dx;
    if (Math.abs(stroke.lastX) < 0.12) return;
    const direction = Math.sign(stroke.lastX);
    stroke.lastX = 0;
    if (direction === stroke.direction) return;
    stroke.direction = direction;
    stroke.flips = stroke.flips.filter((time) => now - time < STROKE_WINDOW_MS);
    stroke.flips.push(now);
    if (stroke.flips.length < STROKE_FLIPS) return;
    stroke.flips = [];
    const petted = this.reaction && now < this.reaction.until && this.reaction.mood !== "dizzy";
    this.reaction = { mood: petted ? "love" : "happy", start: now, until: now + 2400 };
  }

  private currentRadii(t: number): number[] {
    const to = bodyRadii(this.morph.to, t + this.blobOffset);
    const p = this.morph.progress.value;
    const out = Array.from<number>({ length: PROFILE_SAMPLES });
    for (let i = 0; i < PROFILE_SAMPLES; i++) {
      const a = this.morph.from[i] ?? 0;
      out[i] = a + ((to[i] ?? a) - a) * p;
    }
    return out;
  }

  private bodyPath(t: number): string {
    const progress = this.morph.progress;
    const close = Math.abs(progress.value - 1) < 2e-3 && Math.abs(progress.velocity) < 2e-2;
    if (progress.value !== 1 && close) {
      progress.settle(1);
      this.cachedBody = null;
    }
    const settled = progress.value === 1 && progress.velocity === 0;
    if (this.cachedBody === null || !settled || this.morph.to === "blob") {
      this.cachedBody = radialPath(this.currentRadii(t), BODY_RADIUS);
    }
    return this.cachedBody;
  }

  private updateMood(now: number, env: Environment): void {
    const { mood, sleepAfter, drowsyFor } = this.input;
    let phase: SleepPhase = "awake";
    if (mood === "waiting" && sleepAfter > 0) {
      const idle = now - env.lastActivity;
      if (idle >= sleepAfter + drowsyFor) phase = "asleep";
      else if (idle >= sleepAfter) phase = "drowsy";
    }
    if (this.sleep !== "awake" && phase === "awake") this.playAuto("wake", now);
    this.sleep = phase;

    let next: Mood = mood;
    if (phase !== "awake") next = phase;
    else if (this.reaction && now >= this.reaction.until) this.reaction = null;
    else if (this.reaction && now >= this.reaction.start) next = this.reaction.mood;

    if (next !== this.mood) {
      this.mood = next;
      this.moodStart = now;
      this.nextAmbient = now + ambientDelay(next, this.random) * 1000;
    }
  }

  private targetPose(now: number, env: Environment): MoodPose {
    const target: MoodPose = {
      ...NEUTRAL_POSE,
      ...MOOD_TARGETS[this.mood]((now - this.moodStart) / 1000, this.noise),
    };
    const look = this.hover ?? (target.attentive ? env.look : null);
    if (look) {
      const strength = this.hover ? 0.9 : 0.75;
      target.gazeX = look.x * strength;
      target.gazeY = look.y * strength;
      target.yaw += look.x * 0.32;
      target.pitch += look.y * 0.22;
    }
    if (this.hover) target.eyeScale *= 1.08;
    if (this.input.world === "space") addFloat(target, now / 1000, this.floatPhase);
    return target;
  }

  private blinkFactor(now: number, enabled: boolean): number {
    if (!enabled) {
      this.nextBlink = Math.max(this.nextBlink, now + 600);
      return 1;
    }
    if (now >= this.nextBlink) {
      this.blinkStart = now;
      const double = this.random() < 0.18;
      this.nextBlink = now + (double ? BLINK_MS + 90 : 2200 + this.random() * 3800);
    }
    const e = (now - this.blinkStart) / BLINK_MS;
    return e < 1 ? 1 - Math.sin(e * Math.PI) * 0.95 : 1;
  }

  private eyeFactor(kind: EyeKind, now: number): number {
    const swap = this.eyeSwap;
    if (kind !== swap.current && kind !== swap.next) {
      swap.next = kind;
      swap.start = now;
      swap.closeMs = kind === "closed" ? 700 : 90;
    }
    if (swap.next && kind === swap.current) swap.next = null;
    if (swap.next) {
      const e = (now - swap.start) / swap.closeMs;
      if (e < 1) return 1 - e * e;
      swap.current = swap.next;
      swap.next = null;
      swap.openedAt = now;
    }
    return Math.min(1, 0.05 + (now - swap.openedAt) / 110);
  }

  private speech(t: number): number {
    if (this.input.level !== null) return Math.min(1, Math.max(0, this.input.level));
    if (!this.input.speaking) return 0;
    const syllables = Math.max(0, Math.sin(t * 16 + this.noise.smooth(9, t * 3) * 2));
    const words = Math.min(1, Math.max(0, 0.6 + this.noise.smooth(10, t * 2) * 0.9));
    return syllables * words;
  }

  frame(now: number, env: Environment): Frame {
    const dt =
      this.lastFrame === null ? 0 : Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.updateMood(now, env);
    const target = this.targetPose(now, env);
    const pose = poseRecord((key) => this.springs[key].step(target[key], dt));
    if (now >= this.morph.startAt) this.morph.progress.step(1, dt);
    this.runAmbient(now);
    return this.compose(now, pose, target, true);
  }

  private runAmbient(now: number): void {
    if (now < this.nextAmbient) return;
    this.nextAmbient = now + ambientDelay(this.mood, this.random) * 1000;
    if (this.motion || this.sleep !== "awake") return;
    const pick = pickAmbient(this.mood, this.input.world, this.input.ambient, this.random);
    if (!pick) return;
    if ("motion" in pick) this.playAuto(pick.motion, now);
    else this.kick(pick.kick);
  }

  still(now: number, env: Environment): Frame {
    this.updateMood(now, env);
    this.moodStart = now - 600;
    const target = this.targetPose(now, env);
    for (const key of POSE_KEYS) this.springs[key].settle(target[key]);
    this.morph.progress.settle(1);
    this.cachedBody = null;
    this.motion = null;
    this.eyeSwap = {
      current: target.eyeKind,
      next: null,
      start: 0,
      closeMs: 0,
      openedAt: -Infinity,
    };
    const pose = poseRecord((key) => target[key]);
    return this.compose(now, pose, target, false);
  }

  private compose(now: number, pose: Pose, target: MoodPose, live: boolean): Frame {
    const t = now / 1000;
    let openL = 1;
    let openR = 1;
    let kind = target.eyeKind;
    if (this.motion) {
      const spec = MOTIONS[this.motion.name];
      const p = (now - this.motion.start) / 1000 / spec.duration;
      if (p >= 1) {
        this.motion = null;
      } else {
        const delta = spec.delta(Math.max(0, p), this.motion.params);
        for (const key of POSE_KEYS) pose[key] += delta[key] ?? 0;
        openL *= delta.openL ?? 1;
        openR *= delta.openR ?? 1;
        kind = delta.eyeKind ?? kind;
      }
    }
    const blink = live ? this.blinkFactor(now, target.blinks && kind === "open") : 1;
    const swap = live ? this.eyeFactor(kind, now) : 1;
    const voice = live ? this.speech(t) : 0;
    pose.squashY += voice * 0.06;
    pose.squashX -= voice * 0.03;
    pose.eyeOpen += voice * 0.08;

    const particleKey = target.particles && `${this.mood}:${target.particles}`;
    if (particleKey !== this.particleKey) {
      this.particleKey = particleKey;
      this.particleStart = now;
    }

    const geometry = bodyGeometry(this.morph.to);
    return buildFrame({
      body: this.bodyPath(t),
      geometry,
      eyes: this.input.eyes,
      world: this.input.world,
      pose,
      eyeKind: live ? this.eyeSwap.current : kind,
      eyeSpin: target.eyeSpin,
      openL: openL * blink * swap,
      openR: openR * blink * swap,
      eyeLift: voice * 1.4,
      particles: target.particles,
      particleAge: live ? (now - this.particleStart) / 1000 : 1,
      t,
    });
  }
}

export type EyeKind = "open" | "closed" | "happy" | "heart" | "spiral" | "squeeze";
export type ParticleKind = "z" | "heart" | "question" | "exclaim" | "dots" | "sweat";

/** The continuous values that springs smooth from frame to frame. */
export interface Pose {
  /** Where the eyes look, from -1 to 1. Positive is right and down. */
  gazeX: number;
  gazeY: number;
  /** Head turn in radians: yaw turns right, pitch tips forward, roll tilts clockwise. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Sideways offset and height above the floor, in view units. */
  x: number;
  hop: number;
  /** Depth toward the viewer: 0.2 draws it 20% bigger, -0.2 draws it 20% smaller. */
  z: number;
  squashX: number;
  squashY: number;
  scale: number;
  eyeOpen: number;
  eyeScale: number;
  eyeScaleL: number;
  eyeScaleR: number;
  /** How far each lid comes down, as a share of the eye height. */
  lidInner: number;
  lidOuter: number;
  blush: number;
}

export const POSE_KEYS = [
  "gazeX",
  "gazeY",
  "yaw",
  "pitch",
  "roll",
  "x",
  "hop",
  "z",
  "squashX",
  "squashY",
  "scale",
  "eyeOpen",
  "eyeScale",
  "eyeScaleL",
  "eyeScaleR",
  "lidInner",
  "lidOuter",
  "blush",
] as const satisfies readonly (keyof Pose)[];

/** Builds a value for every pose channel. */
export function poseRecord<T>(value: (key: keyof Pose) => T): Record<keyof Pose, T> {
  return {
    gazeX: value("gazeX"),
    gazeY: value("gazeY"),
    yaw: value("yaw"),
    pitch: value("pitch"),
    roll: value("roll"),
    x: value("x"),
    hop: value("hop"),
    z: value("z"),
    squashX: value("squashX"),
    squashY: value("squashY"),
    scale: value("scale"),
    eyeOpen: value("eyeOpen"),
    eyeScale: value("eyeScale"),
    eyeScaleL: value("eyeScaleL"),
    eyeScaleR: value("eyeScaleR"),
    lidInner: value("lidInner"),
    lidOuter: value("lidOuter"),
    blush: value("blush"),
  };
}

export interface MoodPose extends Pose {
  eyeKind: EyeKind;
  /** Rotation of spiral eyes, in radians. */
  eyeSpin: number;
  blinks: boolean;
  /** Whether the eyes follow the pointer, focus or `lookAt` in this mood. */
  attentive: boolean;
  particles: ParticleKind | null;
}

export const NEUTRAL_POSE: MoodPose = {
  gazeX: 0,
  gazeY: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  x: 0,
  hop: 0,
  z: 0,
  squashX: 1,
  squashY: 1,
  scale: 1,
  eyeOpen: 1,
  eyeScale: 1,
  eyeScaleL: 1,
  eyeScaleR: 1,
  lidInner: 0,
  lidOuter: 0,
  blush: 0,
  eyeKind: "open",
  eyeSpin: 0,
  blinks: true,
  attentive: false,
  particles: null,
};

/** One-shot offsets added on top of the sprung pose. */
export interface PoseDelta extends Partial<Pose> {
  /** Openness multipliers for each eye. */
  openL?: number;
  openR?: number;
  eyeKind?: EyeKind;
}

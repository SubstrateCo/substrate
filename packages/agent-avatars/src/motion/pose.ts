export type EyeKind = "open" | "closed" | "happy" | "heart" | "spiral" | "squeeze";
export type ParticleKind = "z" | "heart" | "question" | "exclaim" | "dots" | "sweat";

export interface Pose {
  gazeX: number;
  gazeY: number;
  yaw: number;
  pitch: number;
  roll: number;
  x: number;
  hop: number;
  z: number;
  squashX: number;
  squashY: number;
  scale: number;
  eyeOpen: number;
  eyeScale: number;
  eyeScaleL: number;
  eyeScaleR: number;
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
  eyeSpin: number;
  blinks: boolean;
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

export interface PoseDelta extends Partial<Pose> {
  openL?: number;
  openR?: number;
  eyeKind?: EyeKind;
}

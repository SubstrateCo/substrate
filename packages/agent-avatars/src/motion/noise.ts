/** Seeded, stateless noise, so each avatar moves on its own schedule. */
export interface Noise {
  /** Smooth value noise in [-1, 1]. */
  smooth(channel: number, t: number): number;
  /** A random value in [-1, 1] that holds for about `hold` seconds, then jumps. */
  step(channel: number, t: number, hold: number): number;
}

function hash(a: number, b: number, seed: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43_758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function createNoise(seed: number): Noise {
  return {
    smooth(channel, t) {
      const i = Math.floor(t);
      const f = t - i;
      const u = f * f * (3 - 2 * f);
      const a = hash(i, channel, seed);
      return a + (hash(i + 1, channel, seed) - a) * u;
    },
    step(channel, t, hold) {
      const offset = (hash(channel, 0.5, seed) + 1) / 2;
      return hash(Math.floor(t / hold + offset), channel + 17, seed);
    },
  };
}

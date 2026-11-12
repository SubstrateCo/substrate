/** A seeded PRNG (xmur3 hash + sfc32), so a VU behaves the same in every run. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const next = () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
  }

  /** Uniform in [0, 1). */
  next() {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  between(min: number, max: number) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number) {
    return Math.floor(this.between(min, max + 1));
  }

  chance(probability: number) {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length ? items[Math.floor(this.next() * items.length)] : undefined;
  }

  /** Picks with probability proportional to `weight(item)`. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    const total = items.reduce((sum, item) => sum + Math.max(weight(item), 0), 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const item of items) {
      roll -= Math.max(weight(item), 0);
      if (roll < 0) return item;
    }
    return items.at(-1);
  }

  normal() {
    const u = 1 - this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }

  /** Log-normal with the given median; `spread` is sigma of the underlying normal. */
  logNormal(median: number, spread: number, min = 0, max = Infinity) {
    return Math.min(max, Math.max(min, median * Math.exp(spread * this.normal())));
  }
}

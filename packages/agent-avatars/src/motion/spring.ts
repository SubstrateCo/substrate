export interface SpringConfig {
  stiffness: number;
  damping: number;
}

const MAX_STEP = 1 / 120;

/** A damped spring that chases a target. Fixed sub-steps keep stiff springs stable. */
export class Spring {
  value: number;
  velocity = 0;
  private readonly config: SpringConfig;

  constructor(value: number, config: SpringConfig) {
    this.value = value;
    this.config = config;
  }

  step(target: number, dt: number): number {
    const { stiffness, damping } = this.config;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, MAX_STEP);
      this.velocity += (-stiffness * (this.value - target) - damping * this.velocity) * h;
      this.value += this.velocity * h;
      left -= h;
    }
    return this.value;
  }

  settle(target: number): void {
    this.value = target;
    this.velocity = 0;
  }
}

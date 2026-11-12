import type { FlowName } from "../lib/persona.ts";
import type { World } from "../lib/world.ts";

export interface FlowContext {
  world: World;
}

export interface Flow {
  name: FlowName;
  /** Share of flow picks in smoke and measure, before persona bias. */
  weight: number;
  /** Share in backfill, which mostly writes. 0 never runs. */
  backfillWeight: number;
  run(ctx: FlowContext): Promise<void>;
}

import type { FlowName } from "../../workload.ts";
import type { World } from "../lib/world.ts";

/** The intended workflow could not run; a normal early return is not completion evidence. */
export class FlowSkipped extends Error {}

export async function workflowOutcome(run: () => Promise<void>) {
  try {
    await run();
    return "completed" as const;
  } catch (error) {
    if (error instanceof FlowSkipped) return "skipped" as const;
    throw error;
  }
}

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

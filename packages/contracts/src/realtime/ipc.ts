import type { BridgeAPI } from "../desktop/ipc.ts";
import { z } from "zod";

export const channel = "substrate:realtime";
export const realtimeConnectInput = z.object({
  organizationId: z.string().min(1).max(200).nullable(),
});
export const methods = {
  connect: { input: realtimeConnectInput },
  disconnect: { input: z.undefined() },
};
export type RealtimeMethods = BridgeAPI<typeof methods>;

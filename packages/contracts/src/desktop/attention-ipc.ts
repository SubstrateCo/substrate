import { attentionSummary } from "../attention.ts";
import type { BridgeAPI } from "./ipc.ts";
import { z } from "zod";

export const channel = "substrate:attention";
export const methods = {
  set: {
    input: attentionSummary.extend({ userId: z.string().min(1) }),
  },
};
export type DesktopAttentionAPI = BridgeAPI<typeof methods>;

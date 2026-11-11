import type { BridgeAPI } from "./ipc.ts";
import { z } from "zod";

export const channel = "substrate:window";
export const methods = {
  isFullscreen: { input: z.undefined(), output: z.boolean() },
  setTheme: { input: z.enum(["light", "dark", "system"]) },
};
export type WindowMethods = BridgeAPI<typeof methods>;

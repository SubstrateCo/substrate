import { googleLinkTicket } from "../integrations/google-link.ts";
import type { BridgeAPI } from "./ipc.ts";
import { z } from "zod";

export const googleLinkRequest = z.strictObject({ ticket: googleLinkTicket });
export type GoogleLinkRequest = z.infer<typeof googleLinkRequest>;

export const channel = "substrate:window";
export const methods = {
  isFullscreen: { input: z.undefined(), output: z.boolean() },
  setTheme: { input: z.enum(["light", "dark", "system"]) },
  /**
   * Opens the API's Google link start page in the system browser. Main builds the URL from its
   * own API origin; the renderer sends only a single-use ticket.
   */
  openGoogleLink: { input: googleLinkRequest },
};
export type WindowMethods = BridgeAPI<typeof methods>;
export type Theme = Parameters<WindowMethods["setTheme"]>[0];

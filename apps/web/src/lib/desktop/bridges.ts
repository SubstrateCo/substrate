import type { AgentWorkAPI } from "@substrate/contracts/agent-work/desktop";
import type { ScreenNotificationsBridge } from "@substrate/contracts/desktop/screen-notifications-ipc";
import type { DesktopUpdatesAPI } from "@substrate/contracts/desktop/updates-ipc";
import type { DesktopSettingsAPI, DesktopWindowAPI } from "@substrate/contracts/desktop/window";
import type { HarnessAPI } from "@substrate/contracts/harness/desktop";
import type { RealtimeAPI } from "@substrate/contracts/realtime";

import type { ExposedBridges, ElectronClientOptions } from "@better-auth/electron/client";

declare global {
  interface Window extends Partial<ExposedBridges<ElectronClientOptions>> {
    readonly substrateHarness?: HarnessAPI;
    readonly substrateAgentWork?: AgentWorkAPI;
    readonly substrateWindow?: DesktopWindowAPI;
    readonly substrateDesktopSettings?: DesktopSettingsAPI;
    readonly substrateRealtime?: RealtimeAPI;
    readonly substrateUpdates?: DesktopUpdatesAPI;
    /** Only the screen notification overlay window has this bridge. */
    readonly substrateScreenNotifications?: ScreenNotificationsBridge;
  }
}

export const harnessBridge = () => window.substrateHarness;
export const agentWorkBridge = () => window.substrateAgentWork;
export const windowBridge = () => window.substrateWindow;
export const desktopSettingsBridge = () => window.substrateDesktopSettings;
export const realtimeBridge = () => window.substrateRealtime;
export const updatesBridge = () => window.substrateUpdates;
export const screenNotificationsBridge = () => window.substrateScreenNotifications;
export const desktopPlatform = () => windowBridge()?.platform;
export const hasDesktopAuth = () => Boolean(window.requestAuth);

export async function withHarnessSession<T>(
  organizationId: string,
  fn: (bridge: HarnessAPI) => Promise<T>,
): Promise<T> {
  const bridge = harnessBridge();
  if (!bridge || !organizationId) throw new Error("Select a workspace in the desktop app.");
  const session = await bridge.synchronize();
  if (session.organizationId !== organizationId) throw new Error("Workspace changed.");
  return fn(bridge);
}

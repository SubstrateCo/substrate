import type { HarnessConfiguration } from "@startup-os/contracts/harness";

/** Native session references live in the caller's agent-work store, keyed by its session ID. */
export interface HarnessStorage {
  configure(configuration: HarnessConfiguration): Promise<void>;
  configuration(organizationId: string): Promise<HarnessConfiguration | undefined>;
}

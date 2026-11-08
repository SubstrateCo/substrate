import type { HarnessConfiguration, HarnessSessionRef } from "@startup-os/contracts/harness";

export interface HarnessStorage {
  configure(configuration: HarnessConfiguration): Promise<void>;
  configuration(organizationId: string): Promise<HarnessConfiguration | undefined>;
  save(ref: HarnessSessionRef): Promise<void>;
  session(organizationId: string, id: string): Promise<HarnessSessionRef | undefined>;
}

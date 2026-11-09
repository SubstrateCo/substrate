import type { HarnessConfiguration } from "@startup-os/contracts/harness";

import type { HarnessStorage } from "./storage.ts";

export function createMemoryStorage(): HarnessStorage {
  const configurations = new Map<string, HarnessConfiguration>();
  return {
    async configure(configuration) {
      configurations.set(configuration.organizationId, structuredClone(configuration));
    },
    async configuration(organizationId) {
      return structuredClone(configurations.get(organizationId));
    },
  };
}

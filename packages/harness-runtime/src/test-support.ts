import type { HarnessConfiguration, HarnessSessionRef } from "@startup-os/contracts/harness";

import type { HarnessStorage } from "./storage.ts";

export function createMemoryStorage(): HarnessStorage {
  const configurations = new Map<string, HarnessConfiguration>();
  const sessions = new Map<string, HarnessSessionRef>();
  return {
    async configure(configuration) {
      configurations.set(configuration.organizationId, structuredClone(configuration));
    },
    async configuration(organizationId) {
      return structuredClone(configurations.get(organizationId));
    },
    async save(ref) {
      sessions.set(ref.id, structuredClone(ref));
    },
    async session(organizationId, id) {
      const ref = sessions.get(id);
      return ref?.organizationId === organizationId ? structuredClone(ref) : undefined;
    },
  };
}

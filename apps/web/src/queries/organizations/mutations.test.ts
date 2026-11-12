import { QueryClient } from "@tanstack/react-query";

import { organizationMutationOptions } from "./mutations";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

for (const action of ["rename", "changeRole", "removeMember"] as const) {
  test(`${action} refreshes organization data and only refreshes roles after membership changes`, async () => {
    const client = new QueryClient();
    const list = queryKeys.organizations;
    const detail = queryKeys.organizationDetail("org");
    const role = queryKeys.activeMember("org");
    const messages = queryKeys.messaging("org");
    const untouched = [queryKeys.organizationDetail("other"), queryKeys.activeMember("other")];
    for (const key of [list, detail, role, messages, ...untouched]) client.setQueryData(key, {});
    try {
      await organizationMutationOptions(client, "org")[action].onSuccess();
      expect(client.getQueryState(list)?.isInvalidated).toBe(true);
      expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
      expect(client.getQueryState(role)?.isInvalidated).toBe(action !== "rename");
      expect(client.getQueryState(messages)?.isInvalidated).toBe(action === "removeMember");
      for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  });
}

import { QueryClient } from "@tanstack/react-query";

import { organizationMutationOptions } from "./mutations";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

for (const action of ["rename", "changeRole", "removeMember"] as const) {
  test(`${action} refreshes organization data, the frame summary and people in that organization only`, async () => {
    const client = new QueryClient();
    const list = queryKeys.organizations;
    const detail = queryKeys.organizationDetail("org");
    const summary = queryKeys.organizationSummary("org");
    const people = queryKeys.organizationPeople("org");
    const messages = queryKeys.messaging("org");
    const untouched = [
      queryKeys.organizationDetail("other"),
      queryKeys.organizationSummary("other"),
    ];
    for (const key of [list, detail, summary, people, messages, ...untouched])
      client.setQueryData(key, {});
    try {
      await organizationMutationOptions(client, "org")[action].onSuccess();
      for (const key of [list, detail, summary, people])
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryState(messages)?.isInvalidated).toBe(action === "removeMember");
      for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  });
}

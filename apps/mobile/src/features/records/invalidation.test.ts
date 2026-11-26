import { QueryClient } from "@tanstack/react-query";

import { refreshRecords } from "./invalidation";
import { queryKeys } from "@/queries/keys";
import { describe, expect, test } from "bun:test";

describe("connected record refresh", () => {
  test("refreshes message context and reference search without touching another account or workspace", async () => {
    const client = new QueryClient();
    const scope = { userId: "user-1", organizationId: "workspace-1" };
    const related = ["tasks", "crm", "messaging", "search"].map((domain) =>
      queryKeys.domain(scope, domain),
    );
    const otherWorkspace = queryKeys.domain({ ...scope, organizationId: "workspace-2" }, "tasks");
    const otherAccount = queryKeys.domain({ ...scope, userId: "user-2" }, "messaging");
    for (const key of [...related, otherWorkspace, otherAccount])
      client.setQueryData(key, "loaded");

    await refreshRecords(client, scope);

    for (const key of related) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherWorkspace)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherAccount)?.isInvalidated).toBe(false);
    client.clear();
  });

  test("removes dependent private previews after a move or deletion", async () => {
    const client = new QueryClient();
    const scope = { userId: "user-1", organizationId: "workspace-1" };
    const context = [...queryKeys.domain(scope, "messaging"), "context", "conversation-1"];
    const search = [...queryKeys.domain(scope, "search"), "private task"];
    client.setQueryData(context, { title: "Private task" });
    client.setQueryData(search, [{ title: "Private task" }]);

    await refreshRecords(client, scope, true);

    expect(client.getQueryData(context)).toBeUndefined();
    expect(client.getQueryData(search)).toBeUndefined();
    client.clear();
  });
});

import type { AgentCatalog, AgentConfiguration } from "@substrate/contracts/agents";

import { MutationObserver, QueryClient } from "@tanstack/react-query";

import { agentAvatarMutationOptions } from "./mutations";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

const agent = (id: string, avatar: string): AgentConfiguration => ({
  id,
  name: id,
  instructions: "",
  harness: "opencode",
  enabled: true,
  disabledApps: [],
  substrateGuide: true,
  avatar,
});
const catalog = (): AgentCatalog => ({
  agents: [agent("a1", "100000"), agent("a2", "111111")],
  runSettings: [],
});

test("an avatar choice shows on that agent at once and rolls back when the save fails", async () => {
  const client = new QueryClient();
  const key = queryKeys.agents("owner");
  client.setQueryData(key, catalog());
  const started = Promise.withResolvers<void>();
  const saved = Promise.withResolvers<AgentConfiguration>();
  const options = {
    ...agentAvatarMutationOptions(client, "owner"),
    mutationFn: () => {
      started.resolve();
      return saved.promise;
    },
  };
  try {
    const mutation = new MutationObserver(client, options).mutate({ id: "a1", avatar: "120000" });
    await started.promise;
    const shown = client.getQueryData<AgentCatalog>(key)?.agents;
    expect(shown?.map((item) => item.avatar)).toEqual(["120000", "111111"]);
    saved.reject(new Error("Save failed"));
    await mutation.catch(() => {});
    expect(client.getQueryData<AgentCatalog>(key)).toEqual(catalog());
  } finally {
    client.clear();
  }
});

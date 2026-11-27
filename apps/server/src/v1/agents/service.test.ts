import type { Committed } from "@substrate/database";

import { ServiceError } from "../../shared/service-result";
import { scopeFixture } from "../../test-support";
import { createAgentService } from "./service";
import { expect, mock, test } from "bun:test";

const input = {
  name: "Helper",
  instructions: "Help",
  harness: "opencode" as const,
  enabled: true,
  disabledApps: [],
  substrateGuide: true,
};

test("agent reads and avatar changes use the resolved owner repository without a workspace", async () => {
  const scope = { ...scopeFixture(), organizationId: null };
  const id = crypto.randomUUID();
  const avatar = "131005";
  const configuration = { ...input, id, avatar };
  const setAvatar = mock(async () => ({ result: configuration, hints: [] }));
  const catalog = { agents: [], runSettings: [] };
  scope.owner = {
    ...scope.owner,
    agents: { ...scope.owner.agents, list: async () => catalog, setAvatar },
  };
  const service = createAgentService({ publish: async (committed) => committed.result });
  expect(await service.listAgents(scope)).toEqual({ success: true, data: catalog });
  expect(await service.setAgentAvatar(scope, { id, avatar })).toEqual({
    success: true,
    data: configuration,
  });
  expect(setAvatar).toHaveBeenCalledWith(id, avatar);
});

test("committed writes publish their hints and failed writes never publish", async () => {
  const scope = scopeFixture();
  const saved = { ...input, id: crypto.randomUUID(), avatar: "100000" };
  const committed: Committed<typeof saved> = {
    result: saved,
    hints: [{ audience: ["user", scope.userId], domain: "agents" }],
  };
  const published: string[] = [];
  scope.owner = {
    ...scope.owner,
    agents: {
      ...scope.owner.agents,
      saveAgent: async () => committed,
      deleteAgent: async () => {
        throw new ServiceError("FORBIDDEN", "Cannot delete.");
      },
    },
  };
  const service = createAgentService({
    publish: async (committed) => {
      published.push(...committed.hints.map((hint) => hint.domain));
      return committed.result;
    },
  });
  expect(await service.saveAgent(scope, input)).toEqual({ success: true, data: saved });
  expect(published).toEqual(["agents"]);
  expect(await service.deleteAgent(scope, { id: saved.id })).toMatchObject({ success: false });
  expect(published).toEqual(["agents"]);
});

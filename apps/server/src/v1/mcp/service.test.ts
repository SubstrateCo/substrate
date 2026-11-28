import { mcpTools } from "@substrate/contracts/agent-tools/tools";

import { agentToolRequests, tasks } from "../../../../../packages/database/src/schema";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { mcpFixture } from "../../../../../packages/database/src/testing/mcp";
import { dmTurn } from "../../../../../packages/database/src/testing/turns";
import { scopeFixture } from "../../test-support";
import { createSharpImageCodec } from "../files/image";
import { createMcpService } from "./service";
import { memoryStorage } from "./test-support";
import { expect, spyOn, test } from "bun:test";

const f = setupDatabase();

test("invalid fresh tool output rolls back its write and never reaches the publisher", async () => {
  const { agent, dm, turn } = await mcpFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  let published = false;
  const service = createMcpService({
    db: f.db,
    publish: async (committed) => {
      published = true;
      return committed.result;
    },
    storage: memoryStorage(),
    images: createSharpImageCodec(),
  });
  const parse = mcpTools.create_task.output.parse.bind(mcpTools.create_task.output);
  const output = spyOn(mcpTools.create_task.output, "parse").mockImplementation(() =>
    parse({ id: "invalid" }),
  );
  try {
    expect(
      await service.callAgentTool(
        {
          ...scopeFixture(),
          userId: "alice",
          organizationId: f.orgA,
          installationId: agent.identity.installationId,
        },
        {
          organizationId: f.orgA,
          agentId: agent.agentId,
          tool: "create_task",
          turn: await turn(dmTurn(dm.id)),
          input: { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Rollback" },
        },
      ),
    ).toMatchObject({ success: false });
    expect(output).toHaveBeenCalledTimes(1);
  } finally {
    output.mockRestore();
  }
  expect(published).toBe(false);
  expect(await f.db.select().from(tasks)).toEqual([]);
  expect(await f.db.select().from(agentToolRequests)).toEqual([]);
});

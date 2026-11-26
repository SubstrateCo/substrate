import { mcpTools } from "@substrate/contracts/harness/tools";

import {
  agentAuditEvents,
  agentInvocations,
  agentToolRequests,
  tasks,
} from "../../../../../packages/database/src/schema";
import { dmTurn, threadTurn } from "../../../../../packages/database/src/testing/agent-work";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { mcpCallerFixture, mcpFixture } from "../../../../../packages/database/src/testing/mcp";
import { createCommittedPublisher } from "../../shared/committed";
import { scopeFixture } from "../../test-support";
import { createMcpService } from "./service";
import { memoryStorage } from "./test-support";
import { expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("invalid fresh tool output rolls back its write and never reaches the publisher", async () => {
  const { agent, dm } = await mcpFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  let published = false;
  const service = createMcpService({
    db: f.db,
    publish: async (committed) => {
      published = true;
      return committed.result;
    },
    storage: memoryStorage(),
  });
  const parse = mcpTools.create_task.output.parse.bind(mcpTools.create_task.output);
  // Inject a malformed handler result at the output boundary, after the real task write.
  const output = spyOn(mcpTools.create_task.output, "parse").mockImplementation(() =>
    parse({ id: "invalid" }),
  );
  try {
    expect(
      await service.callAgentTool(
        { ...scopeFixture(), userId: "alice", organizationId: f.orgA },
        {
          organizationId: f.orgA,
          agentId: agent.agentId,
          tool: "create_task",
          turn: { ...dmTurn(dm.id), installationId: agent.identity.installationId },
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

test("publisher failure happens after commit and does not audit a failed tool execution", async () => {
  const x = await mcpCallerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await f.db.select().from(agentInvocations);
  const turn = {
    ...threadTurn(x.channel.id, root.id),
    invocationIds: [call!.id],
    installationId: x.agent.identity.installationId,
  };
  let published = false;
  const service = createMcpService({
    db: f.db,
    publish: createCommittedPublisher({
      publish: async () => {
        // This uses a separate connection, so an uncommitted success audit is not visible.
        const committed = await f.db
          .select()
          .from(agentAuditEvents)
          .where(eq(agentAuditEvents.action, "mcp_call"));
        expect(committed.map((row) => row.result)).toEqual(["ok"]);
        published = true;
        throw new Error("Publisher unavailable");
      },
      sharingMail: { trigger: () => {} },
    }),
    storage: memoryStorage(),
  });
  expect(
    await service.callAgentTool(
      { ...scopeFixture(), userId: "alice", organizationId: f.orgA },
      {
        organizationId: f.orgA,
        agentId: x.agent.agentId,
        tool: "reply",
        input: { requestId: crypto.randomUUID(), body: "Done" },
        turn,
      },
    ),
  ).toMatchObject({ success: false });
  expect(published).toBe(true);
  const logged = await f.db
    .select()
    .from(agentAuditEvents)
    .where(eq(agentAuditEvents.action, "mcp_call"));
  expect(logged.map((row) => row.result)).toEqual(["ok"]);
});

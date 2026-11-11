import { routineView, type RoutineFields } from "@substrate/client-storage/agent-work";
import {
  approveRoutineInput,
  createRoutineInput,
  deleteRoutineInput,
  updateRoutineInput,
  type AgentRoutineView,
} from "@substrate/contracts/agent-work";

import type { RuntimeContext } from "../runtime/context.ts";
import { dueOccurrence, nextOccurrence, validCron } from "./schedule.ts";

/* oxlint-disable deslop/no-unknown-parameters -- Bridge input is parsed here with the contract schemas. */

/**
 * Owner-approved routines. Edits create a new revision; only the approved revision runs. Ticks
 * go to the routine's own unattended session and publish to its destination.
 */
export function createRoutines(context: RuntimeContext) {
  async function owned(routineId: string) {
    const routine = await context.store.routines.get(routineId);
    if (!routine || routine.organizationId !== context.organizationId)
      throw new Error("Routine not found.");
    return routine;
  }
  function checkCron(cron: string, timezone: string) {
    if (!validCron(cron, timezone)) throw new Error("Invalid cron expression.");
  }
  async function destination(
    agentId: string,
    value: { conversationId: string; threadId: string | null } | null,
  ) {
    if (value) return value;
    return {
      conversationId: await context.server.directConversation(context.organizationId, agentId),
      threadId: null,
    };
  }

  return {
    async list(agentId: string): Promise<AgentRoutineView[]> {
      return (await context.store.routines.list(context.organizationId, agentId)).map(routineView);
    },
    async create(value: unknown) {
      const input = createRoutineInput.parse(value);
      if (!(await context.agents.get(input.agentId))) throw new Error("Agent not found.");
      checkCron(input.cron, input.timezone);
      const target = await destination(input.agentId, input.destination);
      const row = await context.store.routines.create(
        {
          organizationId: context.organizationId,
          userAgentId: input.agentId,
          name: input.name,
          prompt: input.prompt,
          cron: input.cron,
          timezone: input.timezone,
          enabled: input.enabled,
          destinationConversationId: target.conversationId,
          destinationThreadId: target.threadId,
        },
        context.now(),
      );
      context.changed({ userAgentId: row.userAgentId });
      return routineView(row);
    },
    async update(value: unknown) {
      const input = updateRoutineInput.parse(value);
      const routine = await owned(input.routineId);
      const { destination: place, ...rest } = input.changes;
      const changes: Partial<RoutineFields> = { ...rest };
      if (place !== undefined) {
        const target = await destination(routine.userAgentId, place);
        changes.destinationConversationId = target.conversationId;
        changes.destinationThreadId = target.threadId;
      }
      const cron = changes.cron ?? routine.cron;
      const timezone = changes.timezone ?? routine.timezone;
      checkCron(cron, timezone);
      const row = await context.store.routines.update(
        routine.id,
        changes,
        nextOccurrence(cron, timezone, context.now()),
      );
      context.changed({ userAgentId: row.userAgentId });
      return routineView(row);
    },
    async approve(value: unknown) {
      const input = approveRoutineInput.parse(value);
      const routine = await owned(input.routineId);
      const row = await context.store.routines.approve(
        routine.id,
        input.revision,
        nextOccurrence(routine.cron, routine.timezone, context.now()),
      );
      context.changed({ userAgentId: row.userAgentId });
      return routineView(row);
    },
    async delete(value: unknown) {
      const routine = await owned(deleteRoutineInput.parse({ routineId: value }).routineId);
      await context.store.routines.delete(routine.id);
      context.changed({ userAgentId: routine.userAgentId });
    },
    /**
     * Queues due ticks of approved routines of agents homed here. Missed ticks collapse to the
     * latest one.
     */
    async tick() {
      const now = context.now();
      let fired = 0;
      for (const routine of await context.store.routines.due(context.organizationId, now)) {
        if (routine.approvedRevision !== routine.revision || routine.nextFireAt === null) continue;
        // Routines fire only on the agent's home device.
        const agent = await context.agents.get(routine.userAgentId);
        if (!agent?.enabled || !agent.home) continue;
        const { occurrence, nextFireAt } = dueOccurrence(
          routine.cron,
          routine.timezone,
          routine.nextFireAt,
          now,
        );
        const item = await context.store.routines.fire(
          {
            routineId: routine.id,
            revision: routine.revision,
            occurrence,
            nextFireAt,
            agentId: routine.userAgentId,
            harness: agent.harness,
          },
          now,
        );
        if (item) fired++;
      }
      if (fired) context.changed({});
      return fired;
    },
  };
}

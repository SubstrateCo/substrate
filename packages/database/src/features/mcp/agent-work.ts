import type { McpInput, McpOutput } from "@substrate/contracts/agent-tools/tools";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { ValidationError } from "../../errors";
import {
  finishHelper,
  helperBySession,
  messageHelper,
  requireHelper,
  sessionHelpers,
  startHelper,
  stopHelper,
} from "../agent-work/helpers";
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  requireRoutine,
  routineApproved,
  updateRoutine,
  type RoutineRow,
} from "../agent-work/routines/routines";
import { agentSessions } from "../agent-work/sessions.schema";
import type { ServerTurn } from "./turn";
import { eq } from "drizzle-orm";

const iso = (value: Date | null) => value?.toISOString() ?? null;

function routineResult(row: RoutineRow): McpOutput<"create_routine"> {
  return {
    routineId: row.id,
    name: row.name,
    prompt: row.prompt,
    cron: row.cron,
    timezone: row.timezone,
    enabled: row.enabled,
    destination: {
      conversationId: row.destinationConversationId,
      threadId: row.destinationThreadId,
    },
    approved: routineApproved(row),
    nextFireAt: iso(row.nextFireAt),
    lastFiredAt: iso(row.lastFiredAt),
  };
}

export function mcpAgentWorkTools(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  turn: ServerTurn,
) {
  const { db } = ctx;
  const owner = { organizationId: identity.organizationId, userId: identity.userId };
  async function session() {
    const [row] = await db.select().from(agentSessions).where(eq(agentSessions.id, turn.sessionId));
    return row!;
  }
  const ownRoutine = (routineId: string) => requireRoutine(db, owner, routineId, turn.userAgentId);
  return {
    async listRoutines() {
      return { items: (await listRoutines(db, owner, turn.userAgentId)).map(routineResult) };
    },
    async createRoutine(input: McpInput<"create_routine">) {
      return routineResult(await createRoutine(db, owner, turn.userAgentId, input, "agent"));
    },
    async updateRoutine(input: McpInput<"update_routine">) {
      const routine = await ownRoutine(input.routineId);
      return routineResult(await updateRoutine(db, routine, input.changes, "agent"));
    },
    async deleteRoutine(input: McpInput<"delete_routine">) {
      await deleteRoutine(db, await ownRoutine(input.routineId));
      return { deleted: true as const };
    },
    async startHelper(input: McpInput<"start_helper">) {
      const helper = await startHelper(db, await session(), input);
      return { helperId: helper.id, status: helper.status };
    },
    async listHelpers() {
      const rows = await sessionHelpers(db, turn.sessionId);
      return {
        items: rows.map((helper) => ({
          helperId: helper.id,
          task: helper.task,
          status: helper.status,
          report: helper.report,
          createdAt: helper.createdAt.toISOString(),
        })),
      };
    },
    async messageHelper(input: McpInput<"message_helper">) {
      const helper = await requireHelper(db, turn.sessionId, input.helperId);
      await messageHelper(db, helper, input.text);
      return { delivered: "queued" as const };
    },
    async stopHelper(input: McpInput<"stop_helper">) {
      const helper = await stopHelper(db, await requireHelper(db, turn.sessionId, input.helperId));
      return { helperId: helper.id, status: helper.status };
    },
    async finishHelper(input: McpInput<"finish_helper">) {
      const helper =
        turn.sessionKind === "helper" ? await helperBySession(db, turn.sessionId) : undefined;
      if (!helper) throw new ValidationError("Only helpers can finish.");
      await finishHelper(db, helper, input.report, new Date());
      return { saved: true as const };
    },
  };
}

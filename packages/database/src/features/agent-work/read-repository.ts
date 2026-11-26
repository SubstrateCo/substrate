import type {
  AgentItemCommandResult,
  AgentRequestResponse,
  AgentTurnCommandResult,
  RoutineChanges,
} from "@substrate/contracts/agent-work";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { queryNeedsYou } from "./needs-you";
import {
  discardItem,
  dismissTurn,
  newTopic,
  ownedItem,
  resendItem,
  retryTurn,
  sendNow,
  startFresh,
  stopTurn,
} from "./owner/commands";
import {
  agentActivity,
  conversationWork,
  ownerItem,
  ownerTurn,
  requireOwnedAgent,
} from "./owner/views";
import {
  approveProposalInTransaction,
  declineProposalInTransaction,
  respondToRequestInTransaction,
} from "./requests/decisions";
import { queryConversationRequests } from "./requests/request-views";
import {
  approveRoutine,
  createRoutine,
  deleteRoutine,
  listRoutines,
  requireRoutine,
  routineView,
  updateRoutine,
  type NewRoutine,
} from "./routines/routines";
import { statusViews } from "./status";

/** The owner's agent work: reads and commands from any of the owner's devices. */
export function createAgentWorkReadRepository(
  context: RepositoryContext,
  identity: SessionIdentity,
) {
  const { db } = context;
  const turnCommand =
    (
      command: (
        db: RepositoryContext["db"],
        identity: SessionIdentity,
        id: string,
      ) => Promise<void>,
    ) =>
    async (turnId: string): Promise<AgentTurnCommandResult> => {
      await command(db, identity, turnId);
      return { turn: await ownerTurn(context, identity, turnId) };
    };
  const itemResult = async (itemId: string, interruptedTurnId: string | null) => ({
    item: await ownerItem(db, identity, await ownedItem(db, identity, itemId)),
    interruptedTurnId,
  });
  return {
    listConversationRequests: (conversationId: string) =>
      queryConversationRequests(db, identity, conversationId),
    listNeedsYou: () => queryNeedsYou(db, identity),
    listStatus: () => statusViews(db, identity),
    agentActivity: (userAgentId: string, cursor?: string) =>
      agentActivity(context, identity, userAgentId, cursor),
    conversationWork: (conversationId: string) =>
      conversationWork(context, identity, conversationId),
    turn: (turnId: string) => ownerTurn(context, identity, turnId),
    async listRoutines(userAgentId: string) {
      await requireOwnedAgent(db, identity, userAgentId);
      return (await listRoutines(db, identity, userAgentId)).map(routineView);
    },
    respondToRequest: (requestId: string, response: AgentRequestResponse) =>
      respondToRequestInTransaction(db, identity, requestId, response),
    approveProposal: (requestId: string) => approveProposalInTransaction(db, identity, requestId),
    declineProposal: (requestId: string) => declineProposalInTransaction(db, identity, requestId),
    stopTurn: turnCommand(stopTurn),
    retryTurn: turnCommand((tx, scope, id) => retryTurn(tx, scope, id)),
    dismissTurn: turnCommand((tx, scope, id) => dismissTurn(tx, scope, id)),
    startFresh: turnCommand((tx, scope, id) => startFresh(tx, scope, id)),
    async sendNow(itemId: string): Promise<AgentItemCommandResult> {
      return itemResult(itemId, await sendNow(db, identity, itemId));
    },
    async resendItem(itemId: string): Promise<AgentItemCommandResult> {
      await resendItem(db, identity, itemId);
      return itemResult(itemId, null);
    },
    async discardItem(itemId: string): Promise<AgentItemCommandResult> {
      await discardItem(db, identity, itemId);
      return itemResult(itemId, null);
    },
    async newTopic(conversationId: string) {
      return { sessionIds: await newTopic(db, identity, conversationId) };
    },
    async createRoutine(userAgentId: string, input: NewRoutine) {
      return routineView(await createRoutine(db, identity, userAgentId, input, "owner"));
    },
    async updateRoutine(routineId: string, changes: RoutineChanges) {
      const routine = await requireRoutine(db, identity, routineId);
      return routineView(await updateRoutine(db, routine, changes, "owner"));
    },
    async deleteRoutine(routineId: string) {
      await deleteRoutine(db, await requireRoutine(db, identity, routineId));
      return null;
    },
    async approveRoutine(routineId: string, revision: number) {
      const routine = await requireRoutine(db, identity, routineId);
      return routineView(await approveRoutine(db, routine, revision));
    },
  };
}

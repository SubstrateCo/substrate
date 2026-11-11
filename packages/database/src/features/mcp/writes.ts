import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { agentActions } from "../agent-work/actions";
import { mcpTaskQueries } from "./tasks";

export function agentWrites(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: Parameters<typeof agentActions>[2],
) {
  const actions = agentActions(ctx, identity, agent);
  const queries = mcpTaskQueries(ctx, identity);
  return {
    async createTask(input: Parameters<typeof actions.createTask>[0]) {
      return queries.getTask((await actions.createTask(input)).entityId);
    },
    async updateTask(input: Parameters<typeof actions.updateTask>[0]) {
      return queries.getTask((await actions.updateTask(input)).entityId);
    },
    postMessage: actions.postMessage,
  };
}

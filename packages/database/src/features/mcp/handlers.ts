import type { TurnContext } from "@substrate/contracts/harness/mcp";
import type { McpInput, ServerToolName } from "@substrate/contracts/harness/tools";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../errors";
import { agentActions } from "../agent-work/actions";
import { attachReference, detachReference } from "../context/service";
import { createAttachmentRepository } from "../files/repository";
import { taskRepository } from "../tasks/repository";
import { mcpContextQueries } from "./context";
import { mcpCrmTools } from "./crm";
import { mcpFileQueries, type FileContentReader } from "./files";
import { listLinkedMessages } from "./links";
import { mcpMessagingQueries } from "./messaging";
import { publishingTools } from "./publishing";
import { mcpSearchQueries } from "./search";
import { mcpTaskQueries } from "./tasks";
import { agentWrites } from "./writes";

type Agent = Parameters<typeof agentActions>[2];

// Handler results are serialized to JSON, then parsed with the tool's output schema.
type ToolPayload = object;
export type ToolHandlers = {
  [K in ServerToolName]: (input: McpInput<K>) => Promise<ToolPayload>;
};

/**
 * What a call runs in. turn: a live turn, checked by the caller; userAgentId is set for writes.
 * proposal: an approved proposal, with no live turn. It runs as the agent of the turn that
 * proposed it, and its ID keys the call's idempotent writes.
 */
export type ToolRun =
  | { kind: "turn"; turn: TurnContext; userAgentId: string | null }
  | { kind: "proposal"; id: string; turnId: string };

export const needsLiveTurn = "This tool needs a live turn. It cannot run in a background turn.";

/**
 * The server tools, run as the agent with its owner's access. Tool calls and approved proposals
 * both use this table, so an approval runs exactly the code the tool runs.
 */
export function serverToolHandlers(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: Agent & { userName: string },
  run: ToolRun,
  /** Reads stored bytes for read_file and download_file. Approved proposals never read files. */
  reader?: FileContentReader,
): ToolHandlers {
  const actor = { id: agent.entityId, name: agent.name, type: agent.type };
  const tasks = taskRepository(ctx);
  const files = mcpFileQueries(ctx, identity, reader);
  const writes = agentWrites(ctx, identity, agent);
  const context = mcpContextQueries(ctx, identity);
  const queries = mcpTaskQueries(ctx, identity);
  const messaging = mcpMessagingQueries(ctx, identity);
  const search = mcpSearchQueries(ctx, identity);
  const crm = () => mcpCrmTools(ctx, identity);
  async function reply(input: McpInput<"reply">) {
    if (run.kind === "turn") {
      if (!run.userAgentId) throw new AccessDeniedError();
      return publishingTools(
        ctx,
        identity,
        { ...agent, userAgentId: run.userAgentId },
        run.turn,
      ).reply(input);
    }
    // Only a reply to another place waits for approval; the proposal checked it has no ask.
    if (!input.to || input.ask) throw new ValidationError(needsLiveTurn);
    const message = await writes.postMessage({
      conversationId: input.to.conversationId,
      threadId: input.to.threadId,
      body: input.body,
      requestId: run.id,
      originTurnId: run.turnId,
    });
    return {
      messageId: message.id,
      conversationId: message.conversationId,
      threadId: message.threadId,
      questionId: null,
      createdAt: message.createdAt.toISOString(),
    };
  }
  return {
    create_crm_from_message: async (value) => crm().createFromMessage(value),
    list_crm_activity: async (value) => crm().activity(value),
    get_crm_settings: async () => crm().settings(),
    update_crm_settings: async (value) => crm().updateSettings(value),
    create_crm_follow_up: async (value) => crm().createFollowUp(value),
    list_crm_records: async (value) => crm().list(value),
    get_crm_record: async (value) => crm().get(value),
    get_crm_pipeline: async () => crm().pipeline(),
    create_crm_account: async (value) => crm().createAccount(value),
    update_crm_account: async (value) => crm().updateAccount(value),
    create_crm_contact: async (value) => crm().createContact(value),
    update_crm_contact: async (value) => crm().updateContact(value),
    create_crm_deal: async (value) => crm().createDeal(value),
    update_crm_deal: async (value) => crm().updateDeal(value),
    transition_crm_deal: async (value) => crm().transition(value),
    list_crm_interactions: async (value) => crm().listInteractions(value),
    create_crm_interaction: async (value) => crm().createInteraction(value),
    publish_crm_interaction: async (value) => crm().publishInteraction(value),
    search_crm_interactions: async (value) => crm().searchInteractions(value),
    get_crm_interaction: async (value) => crm().getInteraction(value.entityId),
    update_crm_interaction: async (value) => crm().updateInteraction(value),
    find_crm_contacts: async (value) => crm().findContacts(value),
    change_crm_contact_detail: async (value) => crm().changeContactDetail(value),
    set_crm_affiliation: async (value) => crm().setAffiliation(value),
    remove_crm_affiliation: async (value) => crm().removeAffiliation(value),
    list_crm_follow_ups: async (value) => crm().followUps(value.entityId),
    get_me: () => context.getMe(actor, agent.userName),
    search_names: (value) => search.names(value),
    search_content: (value) => search.content(value),
    list_assignees: (value) => context.listAssignees(value),
    list_projects: (value) => queries.listProjects(value),
    get_project: (value) => queries.getProject(value),
    list_tasks: (value) => queries.listTasks(value),
    get_task: (value) => queries.getTask(value.taskId),
    list_task_activity: (value) => queries.listActivity(value),
    list_conversations: (value) => messaging.listConversations(value),
    read_conversation: (value) => messaging.readConversation(value),
    read_thread: (value) => messaging.readThread(value),
    list_linked_messages: (value) => listLinkedMessages(ctx, identity, value),
    list_files: (value) => files.list(value),
    read_file: (value) => files.read(value),
    download_file: (value) => files.download(value),
    async attach_task_file(value) {
      const task = await tasks.get(value.taskId, "edit");
      await createAttachmentRepository(ctx).addTaskFromMessage({
        taskEntityId: task.entityId,
        projectEntityId: task.projectEntityId,
        messageId: value.file.messageId,
        attachmentId: value.file.attachmentId,
      });
      return queries.getTask(task.entityId);
    },
    create_task: (value) => writes.createTask(value),
    update_task: (value) => writes.updateTask(value),
    move_task: (value) => writes.moveTask(value),
    create_project: (value) => writes.createProject(value),
    update_project: (value) => writes.updateProject(value),
    delete_task: (value) => writes.deleteTask(value),
    archive_project: (value) => writes.archiveProject(value),
    restore_project: (value) => writes.restoreProject(value),
    delete_project: (value) => writes.deleteProject(value),
    share_project: (value) => writes.shareProject(value),
    revoke_project_access: (value) => writes.revokeProjectAccess(value),
    archive_crm_record: async (value) => crm().archiveRecord(value),
    delete_crm_interaction: async (value) => crm().deleteInteraction(value),
    assign_crm_owner: async (value) => crm().assignOwner(value),
    share_crm_record: async (value) => crm().share(value),
    revoke_crm_access: async (value) => crm().revoke(value),
    async get_task_discussion(value) {
      return { conversationId: await tasks.ensureDiscussion(value.taskId) };
    },
    async add_task_link(value) {
      await tasks.addLink(value.taskId, value.relation, value.otherTaskId);
      return queries.getTask(value.taskId);
    },
    async remove_task_link(value) {
      await tasks.removeLink(value.taskId, value.linkId);
      return queries.getTask(value.taskId);
    },
    reply,
    async attach_message(value) {
      return { changed: await attachReference(ctx, identity, value, value.target) };
    },
    async detach_message(value) {
      return { changed: await detachReference(ctx, identity, value, value.target) };
    },
  };
}

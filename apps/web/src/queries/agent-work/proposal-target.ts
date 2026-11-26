import type { AgentRequestView, ProposalAction } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import {
  proposalTarget,
  type ProposalCrmRecord,
  type ProposalLookups,
  type ProposalProject,
  type ProposalTarget,
} from "@/lib/agent-work/proposal-target";
import { conversationName } from "@/lib/messaging/conversations";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import { recordPeople } from "@/lib/people/record-people";
import { contactOptions } from "@/queries/contacts/options";
import { interactionRecordOptions } from "@/queries/context/interactions";
import { messageTargetOptions } from "@/queries/context/links";
import { crmPeopleOptions } from "@/queries/crm/management";
import { accountOptions, dealOptions } from "@/queries/crm/options";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";
import { projectQueryOptions, taskLocationQueryOptions } from "@/queries/tasks/options";

const labelLength = 120;

/** Undefined while it loads, null when the viewer can't open it. */
function state<T>(query: { data?: T; isPending: boolean; error: Error | null }) {
  if (query.isPending) return undefined;
  return query.error || query.data === undefined ? null : query.data;
}

function messageLabel(body: string) {
  const text = plainReferenceText(body).replace(/\s+/g, " ").trim();
  return text.length > labelLength ? `${text.slice(0, labelLength - 1)}…` : text || "A message";
}

function useProposalProject(organizationId: string, action: ProposalAction | undefined) {
  const taskId =
    action?.type === "update_task" || action?.type === "delete_task"
      ? action.input.taskId
      : undefined;
  const location = useQuery(taskLocationQueryOptions(organizationId, taskId));
  // Creates and project actions name their project. A task change names only a task, so find
  // its project first.
  const projectId =
    action && "projectId" in action.input ? action.input.projectId : location.data?.projectEntityId;
  const details = useQuery(projectQueryOptions(organizationId, projectId));
  const project = (id: string): ProposalProject | null | undefined =>
    id === projectId ? state(details) : null;
  // A task the viewer can't open has no location, so no project holds it.
  const located = location.error ? null : state(details);
  let projects: ProposalProject[] | undefined;
  if (located !== undefined) projects = located ? [located] : [];
  return { project, projects };
}

/** The CRM record, interaction and person a CRM proposal names. */
function useProposalCrm(organizationId: string, action: ProposalAction | undefined) {
  const entityId =
    action?.type === "archive_crm_record" ||
    action?.type === "assign_crm_owner" ||
    action?.type === "share_crm_record" ||
    action?.type === "revoke_crm_access"
      ? action.input.entityId
      : "";
  // Archive names its kind. The other actions take an account or a deal, so read both; only the
  // record's own kind succeeds.
  const kind = action?.type === "archive_crm_record" ? action.input.kind : undefined;
  const reads = {
    account: !!entityId && (kind ?? "account") === "account",
    deal: !!entityId && (kind ?? "deal") === "deal",
    contact: !!entityId && kind === "contact",
  };
  const account = useQuery({ ...accountOptions(organizationId, entityId), enabled: reads.account });
  const deal = useQuery({ ...dealOptions(organizationId, entityId), enabled: reads.deal });
  const contact = useQuery({ ...contactOptions(organizationId, entityId), enabled: reads.contact });
  const interactionId = action?.type === "delete_crm_interaction" ? action.input.entityId : "";
  const interaction = useQuery({
    ...interactionRecordOptions(organizationId, interactionId),
    enabled: !!interactionId,
  });
  const choosesPerson =
    action?.type === "assign_crm_owner" ||
    action?.type === "share_crm_record" ||
    action?.type === "revoke_crm_access";
  const actors = useQuery({ ...crmPeopleOptions(organizationId), enabled: choosesPerson });
  const members = useQuery({
    ...workspacePeopleQueryOptions(organizationId),
    enabled: choosesPerson,
  });

  const crmRecord = (id: string): ProposalCrmRecord | null | undefined => {
    if (id !== entityId) return null;
    if (account.data) return { kind: "account", name: account.data.account.name };
    if (deal.data) return { kind: "deal", name: deal.data.deal.title };
    if (contact.data) return { kind: "contact", name: contact.data.profile.displayName };
    // A query that is not enabled stays pending, so only enabled reads can still be loading.
    const loading =
      (reads.account && account.isPending) ||
      (reads.deal && deal.isPending) ||
      (reads.contact && contact.isPending);
    return loading ? undefined : null;
  };
  return {
    crmRecord,
    interaction: (id: string) => {
      if (id !== interactionId) return null;
      const data = state(interaction);
      return (
        data && {
          label: `${data.interaction.contactName}: ${messageLabel(data.interaction.summary)}`,
        }
      );
    },
    person: (actorId: string) => {
      if (actors.isPending || members.isPending) return undefined;
      if (actors.error || members.error) return null;
      const person = recordPeople(actors.data, members.data).find((entry) => entry.id === actorId);
      return person ? { name: person.name } : null;
    },
  };
}

/**
 * The records a proposal names, resolved through the viewer's own reads. Each server read checks
 * access, so a record the viewer can't open resolves as hidden.
 */
export function useProposalTarget(
  organizationId: string,
  request: AgentRequestView,
  enabled = true,
): ProposalTarget | null {
  const action = enabled ? request.proposal?.action : undefined;
  const sourceConversationId =
    request.place.access === "visible" ? request.place.conversationId : null;
  let message: { conversationId: string; messageId: string } | undefined;
  if (action?.type === "reply_elsewhere" && action.input.threadId)
    message = { conversationId: action.input.conversationId, messageId: action.input.threadId };
  else if (action?.type === "create_task" && action.input.sourceMessageId && sourceConversationId)
    message = { conversationId: sourceConversationId, messageId: action.input.sourceMessageId };

  const conversations = useQuery({
    ...conversationsQueryOptions(
      organizationId,
      action?.type === "reply_elsewhere" ? action.input.conversationId : undefined,
    ),
    enabled: action?.type === "reply_elsewhere",
  });
  const work = useProposalProject(organizationId, action);
  const crm = useProposalCrm(organizationId, action);
  const target = useQuery(
    messageTargetOptions(organizationId, message?.conversationId, message?.messageId),
  );
  if (!action) return null;

  const lookups: ProposalLookups = {
    organizationId,
    sourceConversationId,
    ...work,
    ...crm,
    conversation: (id) => {
      const list = state(conversations);
      if (list === undefined) return undefined;
      const conversation = list?.find((entry) => entry.id === id);
      return conversation ? { name: conversationName(conversation) } : null;
    },
    message: (conversationId, messageId) => {
      if (message?.conversationId !== conversationId || message.messageId !== messageId)
        return null;
      const data = state(target);
      return data && { label: messageLabel(data.message.body) };
    },
  };
  return proposalTarget(action, lookups);
}

import type { AgentRequestView } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import {
  proposalTarget,
  type ProposalLookups,
  type ProposalProject,
  type ProposalTarget,
} from "@/lib/agent-work/proposal-target";
import { conversationName } from "@/lib/messaging/conversations";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import { messageTargetOptions } from "@/queries/context/links";
import { conversationsQueryOptions } from "@/queries/messaging/options";
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
  // create_task names its project. update_task names only a task, so find the task's project.
  const location = useQuery({
    ...taskLocationQueryOptions(
      organizationId,
      action?.type === "update_task" ? action.input.taskId : "",
    ),
    enabled: action?.type === "update_task",
  });
  const projectId =
    action?.type === "create_task" ? action.input.projectId : location.data?.projectEntityId;
  const details = useQuery({
    ...projectQueryOptions(organizationId, projectId ?? ""),
    enabled: !!projectId,
  });
  const target = useQuery({
    ...messageTargetOptions(
      organizationId,
      message?.conversationId ?? "",
      message?.messageId ?? "",
    ),
    enabled: !!message,
  });
  if (!action) return null;

  const detail = (id: string): ProposalProject | null | undefined =>
    id === projectId ? state(details) : null;
  // A task the viewer can't open has no location, so no project holds it.
  const located = location.error ? null : state(details);
  let projects: ProposalProject[] | undefined;
  if (located !== undefined) projects = located ? [located] : [];
  const lookups: ProposalLookups = {
    organizationId,
    sourceConversationId,
    conversation: (id) => {
      const list = state(conversations);
      if (list === undefined) return undefined;
      const conversation = list?.find((entry) => entry.id === id);
      return conversation ? { name: conversationName(conversation) } : null;
    },
    project: detail,
    projects,
    message: (conversationId, messageId) => {
      if (message?.conversationId !== conversationId || message.messageId !== messageId)
        return null;
      const data = state(target);
      return data && { label: messageLabel(data.message.body) };
    },
  };
  return proposalTarget(action, lookups);
}

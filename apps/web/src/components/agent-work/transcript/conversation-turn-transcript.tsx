import { useQuery } from "@tanstack/react-query";

import { TurnTranscript } from "./turn-transcript";
import { isAccessFailure } from "@/api/access-failure";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { Conversation } from "@/lib/messaging/conversations";
import {
  agentStatusOptions,
  conversationRequestsOptions,
  turnOptions,
} from "@/queries/agent-work/server";

export function ConversationTurnTranscript({
  conversation,
  turnId,
  onClose,
}: {
  conversation: Conversation;
  turnId: string;
  onClose: () => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const work = useQuery(turnOptions(userId, organizationId, turnId));
  const requests = useQuery(conversationRequestsOptions(userId, organizationId, conversation.id));
  const statuses = useQuery(agentStatusOptions(userId, organizationId));
  const turn = work.data;
  const agent = conversation.members.find(
    (member) => member.type === "agent" && member.agentId === turn?.userAgentId,
  );
  const status = statuses.data?.find((entry) => entry.userAgentId === turn?.userAgentId);
  return (
    <TurnTranscript
      turn={turn}
      turnLoading={work.isPending}
      turnError={work.error}
      onRetryTurn={() => void work.refetch()}
      agentName={agent?.name ?? status?.agent.name ?? "Agent"}
      device={status?.device?.name}
      requests={requests.data ?? []}
      unavailable={isAccessFailure(work.error) ? "This work is no longer available." : undefined}
      onClose={onClose}
    />
  );
}

import { useQuery } from "@tanstack/react-query";

import { TurnTranscript } from "./turn-transcript";
import type { Conversation } from "@/lib/messaging/conversations";
import { hasAgentWorkBridge } from "@/queries/agent-work/bridge";
import { turnOptions } from "@/queries/agent-work/local";
import { conversationRequestsOptions } from "@/queries/agent-work/server";

/** The transcript beside a conversation. The turn is read by ID from the home desktop. */
export function ConversationTurnTranscript({
  userId,
  organizationId,
  conversation,
  turnId,
  onClose,
}: {
  userId: string;
  organizationId: string;
  conversation: Conversation;
  turnId: string;
  onClose: () => void;
}) {
  const bridge = hasAgentWorkBridge();
  const work = useQuery({ ...turnOptions(userId, organizationId, turnId), enabled: bridge });
  const requests = useQuery(conversationRequestsOptions(userId, organizationId, conversation.id));
  const turn = work.data ?? undefined;
  const agent = conversation.members.find(
    (member) => member.type === "agent" && member.agentId === turn?.userAgentId,
  );
  let unavailable: string | undefined;
  if (!bridge) unavailable = "Open the desktop app that runs this agent to see its transcript.";
  else if (work.isSuccess && !turn) unavailable = "This work is not on this desktop.";
  return (
    <TurnTranscript
      userId={userId}
      organizationId={organizationId}
      turn={turn}
      turnLoading={work.isPending}
      turnError={work.error}
      onRetryTurn={() => void work.refetch()}
      agentName={agent?.name ?? "Agent"}
      requests={requests.data ?? []}
      unavailable={unavailable}
      onClose={onClose}
    />
  );
}

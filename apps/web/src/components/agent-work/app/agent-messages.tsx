import { useQuery } from "@tanstack/react-query";

import { AgentMessagesEmpty } from "./agent-messages-empty";
import { PaneState } from "@/components/feedback/pane-state";
import { ConversationPane } from "@/components/messaging/conversations/conversation-pane";
import { MessageLoading } from "@/components/messaging/messages/message-loading";
import { agentDirectMessage } from "@/lib/messaging/conversations";
import { useDirectMessage } from "@/queries/messaging/conversations";
import { conversationsQueryOptions } from "@/queries/messaging/options";

export function AgentMessages({
  userId,
  organizationId,
  agentId,
  name,
  enabled,
  messageId,
  turnId,
  onNavigate,
  onSettings,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  name: string;
  enabled: boolean;
  messageId?: string;
  turnId?: string;
  onNavigate: (target: { messageId?: string; turnId?: string }) => void;
  onSettings: () => void;
}) {
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const conversation = agentDirectMessage(conversations.data ?? [], agentId);
  const { mutate, isPending, error } = useDirectMessage(organizationId);
  if (conversation)
    return (
      <ConversationPane
        key={conversation.id}
        organizationId={organizationId}
        conversation={conversation}
        userId={userId}
        messageId={messageId}
        turnId={turnId}
        header={null}
        onNavigate={onNavigate}
      />
    );
  if (conversations.error || error)
    return (
      <PaneState
        label="Couldn’t open agent messages"
        error={conversations.error ?? error}
        onRetry={() => {
          if (conversations.error) void conversations.refetch();
          else mutate({ agentIds: [agentId] });
        }}
      />
    );
  if (conversations.isPending) return <MessageLoading label="Loading agent messages" />;
  return (
    <AgentMessagesEmpty
      name={name}
      enabled={enabled}
      pending={isPending}
      onStart={() => mutate({ agentIds: [agentId] })}
      onSettings={onSettings}
    />
  );
}

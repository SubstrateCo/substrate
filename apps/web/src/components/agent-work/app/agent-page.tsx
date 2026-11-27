import type { AgentStatusView } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { AgentActivity } from "./agent-activity";
import { AgentMessages } from "./agent-messages";
import { AgentPageView } from "./agent-page-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { AgentView } from "@/lib/agent-work/agent-sections";
import { agentHeaderStatus } from "@/lib/agent-work/status";
import { agentDirectMessage, conversationTextLabel } from "@/lib/messaging/conversations";
import { messageLink } from "@/lib/navigation/record-links";
import { conversationsQueryOptions } from "@/queries/messaging/options";

/**
 * One agent's page. Work and settings come from the server, so they work on every owner device.
 * Only transcripts and local configuration need the agent's home desktop.
 */
export function AgentPage({
  agentId,
  name,
  enabled,
  status,
  view,
  settingsOpen,
  selectedTurnId,
  messageId,
  onMessageNavigate,
  onViewChange,
  onSettingsChange,
  onTranscript,
}: {
  agentId: string;
  name: string;
  enabled: boolean;
  status?: AgentStatusView;
  view: AgentView;
  settingsOpen: boolean;
  selectedTurnId?: string;
  messageId?: string;
  onMessageNavigate: (target: { messageId?: string; turnId?: string }) => void;
  onViewChange: (view: AgentView) => void;
  onSettingsChange: (open: boolean) => void;
  onTranscript: (turnId: string) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const conversations = useQuery(conversationsQueryOptions(organizationId)).data ?? [];
  const header =
    status && agentHeaderStatus(status, agentDirectMessage(conversations, agentId)?.id);
  // Only a conversation in the viewer's list gets a name; otherwise the header says "Working".
  const place = conversations.find(
    (conversation) => conversation.id === header?.elsewhereConversationId,
  );
  return (
    <AgentPageView
      name={name}
      status={header}
      elsewhere={
        place && {
          link: messageLink(organizationId, place.id),
          label: conversationTextLabel(place),
        }
      }
      view={view}
      onViewChange={onViewChange}
      settingsOpen={settingsOpen}
      onSettingsChange={onSettingsChange}
      messages={
        <AgentMessages
          agentId={agentId}
          name={name}
          enabled={enabled}
          messageId={messageId}
          turnId={selectedTurnId}
          onNavigate={onMessageNavigate}
          onSettings={() => onSettingsChange(true)}
        />
      }
      work={
        <AgentActivity
          agentId={agentId}
          name={name}
          selectedTurnId={selectedTurnId}
          onTranscript={onTranscript}
        />
      }
    />
  );
}

import type { AgentStatusView } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import type { ComponentProps } from "react";

import { Routines } from "../routines/routines";
import { AgentActivity } from "./agent-activity";
import { AgentMessages } from "./agent-messages";
import { AgentPageView } from "./agent-page-view";
import { AgentSettingsPanel } from "./agent-settings-panel";
import { AgentSettings } from "@/components/agents/agent-settings";
import { UnsavedDraftsProvider } from "@/components/feedback/unsaved-drafts";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { isAgentSettingsSection, type AgentPageSection } from "@/lib/agent-work/agent-sections";
import { agentHeaderStatus } from "@/lib/agent-work/status";
import { agentDirectMessage, conversationTextLabel } from "@/lib/messaging/conversations";
import { messageLink } from "@/lib/navigation/record-links";
import { conversationsQueryOptions } from "@/queries/messaging/options";

/**
 * One agent's page. Activity, routines and settings come from the server, so they work on every
 * owner device. Only transcripts and local configuration need the agent's home desktop.
 */
export function AgentPage(props: ComponentProps<typeof AgentPageContent>) {
  return (
    <UnsavedDraftsProvider>
      <AgentPageContent {...props} />
    </UnsavedDraftsProvider>
  );
}

function AgentPageContent({
  agentId,
  name,
  enabled,
  status,
  section,
  selectedTurnId,
  messageId,
  onMessageNavigate,
  onSectionChange,
  onTranscript,
  onDeleted,
}: {
  agentId: string;
  name: string;
  enabled: boolean;
  status?: AgentStatusView;
  section: AgentPageSection;
  selectedTurnId?: string;
  messageId?: string;
  onMessageNavigate: (target: { messageId?: string; turnId?: string }) => void;
  onSectionChange: (section: AgentPageSection) => void;
  onTranscript: (turnId: string) => void;
  onDeleted: () => void;
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
      section={section}
      onSectionChange={onSectionChange}
      messages={
        <AgentMessages
          agentId={agentId}
          name={name}
          enabled={enabled}
          messageId={messageId}
          turnId={selectedTurnId}
          onNavigate={onMessageNavigate}
          onSettings={() => onSectionChange("general")}
        />
      }
      activity={
        <AgentActivity
          agentId={agentId}
          name={name}
          selectedTurnId={selectedTurnId}
          onTranscript={onTranscript}
        />
      }
      routines={<Routines agentId={agentId} name={name} />}
      settings={
        isAgentSettingsSection(section) && (
          <AgentSettingsPanel section={section} onSectionChange={onSectionChange}>
            <AgentSettings
              agentId={agentId}
              section={section}
              onSectionChange={onSectionChange}
              onClose={onDeleted}
            />
          </AgentSettingsPanel>
        )
      }
    />
  );
}

import type { AgentStatusView } from "@substrate/contracts/agent-work";

import type { ComponentProps } from "react";

import { Routines } from "../routines/routines";
import { AgentActivity } from "./agent-activity";
import { AgentMessages } from "./agent-messages";
import { AgentPageView } from "./agent-page-view";
import { AgentSettingsPanel } from "./agent-settings-panel";
import { AgentSettings } from "@/components/agents/agent-settings";
import { UnsavedDraftsProvider } from "@/components/feedback/unsaved-drafts";
import { isAgentSettingsSection, type AgentPageSection } from "@/lib/agent-work/agent-sections";
import { agentStatus } from "@/lib/agent-work/status";

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
  return (
    <AgentPageView
      name={name}
      status={status && agentStatus(status)}
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

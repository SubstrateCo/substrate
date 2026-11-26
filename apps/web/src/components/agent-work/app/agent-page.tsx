import type { AgentStatusView } from "@substrate/contracts/agent-work";

import type { ComponentProps } from "react";

import { CallsLog } from "../calls/calls-log";
import { Routines } from "../routines/routines";
import { AgentActivity } from "./agent-activity";
import { AgentMessages } from "./agent-messages";
import { AgentPageView } from "./agent-page-view";
import { AgentSettingsPanel } from "./agent-settings-panel";
import { ContentNotice } from "@/components/feedback/content-notice";
import { UnsavedDraftsProvider } from "@/components/feedback/unsaved-drafts";
import { Button } from "@/components/ui/button";
import { isAgentSettingsSection, type AgentPageSection } from "@/lib/agent-work/agent-sections";
import { agentStatus, homeDeviceNotice } from "@/lib/agent-work/status";
import { Laptop } from "lucide-react";

/**
 * One agent's page. Activity and routines live on the agent's home desktop; other devices say
 * where to open them. Settings work on every device.
 */
export function AgentPage(props: ComponentProps<typeof AgentPageContent>) {
  return (
    <UnsavedDraftsProvider>
      <AgentPageContent {...props} />
    </UnsavedDraftsProvider>
  );
}

function AgentPageContent({
  userId,
  organizationId,
  agentId,
  name,
  enabled,
  homedHere,
  status,
  section,
  selectedTurnId,
  messageId,
  onMessageNavigate,
  onSectionChange,
  onTranscript,
  onDeleted,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  name: string;
  enabled: boolean;
  homedHere: boolean;
  status?: AgentStatusView;
  section: AgentPageSection;
  selectedTurnId?: string;
  messageId?: string;
  onMessageNavigate: (target: { messageId?: string; turnId?: string }) => void;
  onSectionChange: (section: AgentPageSection) => void;
  onTranscript: (turnId: string) => void;
  onDeleted: () => void;
}) {
  const device = status?.device;
  const unavailable = !homedHere && (
    <ContentNotice
      icon={Laptop}
      title={homeDeviceNotice(device?.name)}
      description={
        device
          ? `${name} runs on ${device.name}. Its activity, transcripts, and routines are stored there.`
          : `${name} works once a desktop runs it. Open Substrate on your desktop, then choose Run on this device in run settings.`
      }
      action={
        !device && (
          <Button type="button" variant="outline" onClick={() => onSectionChange("run")}>
            Open run settings
          </Button>
        )
      }
    />
  );
  return (
    <AgentPageView
      name={name}
      status={status && agentStatus(status)}
      section={section}
      onSectionChange={onSectionChange}
      messages={
        <AgentMessages
          userId={userId}
          organizationId={organizationId}
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
        unavailable || (
          <AgentActivity
            userId={userId}
            organizationId={organizationId}
            agentId={agentId}
            name={name}
            selectedTurnId={selectedTurnId}
            onTranscript={onTranscript}
          />
        )
      }
      routines={
        unavailable || (
          <Routines userId={userId} organizationId={organizationId} agentId={agentId} name={name} />
        )
      }
      calls={<CallsLog userId={userId} organizationId={organizationId} agentId={agentId} />}
      settings={
        isAgentSettingsSection(section) && (
          <AgentSettingsPanel
            userId={userId}
            organizationId={organizationId}
            agentId={agentId}
            section={section}
            onSectionChange={onSectionChange}
            onDeleted={onDeleted}
          />
        )
      }
    />
  );
}

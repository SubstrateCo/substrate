import type { AgentStatusView } from "@substrate/contracts/agent-work";

import type { ComponentProps } from "react";

import { Routines } from "../routines/routines";
import { AgentActivity } from "./agent-activity";
import { AgentPageView } from "./agent-page-view";
import { isAgentSettingsSection, type AgentPageSection } from "./agent-sections";
import { AgentSettings } from "@/components/agents/agent-settings";
import { ContentNotice } from "@/components/feedback/content-notice";
import { UnsavedDraftsProvider, useDraftKeys } from "@/components/feedback/unsaved-drafts";
import { SettingsContent } from "@/components/layout/settings-page";
import { Button } from "@/components/ui/button";
import { agentStatus, noDesktopLabel } from "@/lib/agent-work/status";
import { Laptop } from "lucide-react";

/**
 * One agent's page. Activity and routines live on the agent's home desktop; other devices say
 * where to open them. Settings work on every device.
 */
export function AgentPage(props: ComponentProps<typeof AgentPageContent>) {
  return (
    <UnsavedDraftsProvider key={props.agentId}>
      <AgentPageContent {...props} />
    </UnsavedDraftsProvider>
  );
}

function AgentPageContent({
  userId,
  organizationId,
  agentId,
  name,
  homedHere,
  status,
  section,
  selectedTurnId,
  onSectionChange,
  onTranscript,
  onDeleted,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  name: string;
  homedHere: boolean;
  status?: AgentStatusView;
  section: AgentPageSection;
  selectedTurnId?: string;
  onSectionChange: (section: AgentPageSection) => void;
  onTranscript: (turnId: string) => void;
  onDeleted: () => void;
}) {
  const unsaved = useDraftKeys().filter(isAgentSettingsSection);
  const device = status?.device;
  const unavailable = !homedHere && (
    <ContentNotice
      icon={Laptop}
      title={device ? `Open on ${device.name}` : noDesktopLabel}
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
  let content;
  if (isAgentSettingsSection(section))
    content = (
      <SettingsContent>
        <AgentSettings
          userId={userId}
          organizationId={organizationId}
          agentId={agentId}
          section={section}
          onSectionChange={onSectionChange}
          runSettingsDirty={unsaved.includes("run")}
          onClose={onDeleted}
        />
      </SettingsContent>
    );
  else if (unavailable) content = unavailable;
  else if (section === "routines")
    content = (
      <Routines userId={userId} organizationId={organizationId} agentId={agentId} name={name} />
    );
  else
    content = (
      <AgentActivity
        userId={userId}
        organizationId={organizationId}
        agentId={agentId}
        name={name}
        selectedTurnId={selectedTurnId}
        onTranscript={onTranscript}
      />
    );
  return (
    <AgentPageView
      name={name}
      status={status && agentStatus(status)}
      section={section}
      unsaved={unsaved}
      onSectionChange={onSectionChange}
    >
      {content}
    </AgentPageView>
  );
}

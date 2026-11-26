import type { AgentSection } from "../editors/agent-form";
import { ConfigurationListLoading } from "./configuration-sections";
import { ErrorState } from "@/components/feedback/error-state";
import { SettingsNote } from "@/components/layout/settings-section";
import { Laptop } from "lucide-react";

/** Where to edit the configuration when this device is not the agent's home desktop. */
function homeNotice(section: AgentSection, homeDeviceName?: string) {
  const items = section === "skills" ? "Skills" : "MCP servers";
  return homeDeviceName
    ? `${items} are edited on ${homeDeviceName}, this agent’s home desktop. Open Substrate there to change them.`
    : `${items} are edited on this agent’s home desktop. Open Substrate on your desktop, then choose Run on this device in run settings.`;
}

export function ConfigurationStatus({
  available,
  agentId,
  homeDeviceName,
  section,
  pending,
  error,
  onRetry,
}: {
  available: boolean;
  agentId?: string;
  /** The agent's home desktop, when it has one. */
  homeDeviceName?: string;
  section: AgentSection;
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <>
      {!available && (
        <SettingsNote icon={<Laptop />}>
          {agentId
            ? homeNotice(section, homeDeviceName)
            : "Save this agent to see its local configuration."}
        </SettingsNote>
      )}
      {available && pending && (
        <div role="status" aria-label="Reading the agent’s files">
          <div aria-hidden="true">
            <ConfigurationListLoading section={section} />
          </div>
        </div>
      )}
      {error && (
        <ErrorState variant="compact" title="Couldn’t read this agent’s files" onRetry={onRetry} />
      )}
    </>
  );
}

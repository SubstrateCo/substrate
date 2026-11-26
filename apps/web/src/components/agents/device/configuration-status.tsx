import type { AgentSection } from "../editors/agent-form";
import { ConfigurationListLoading } from "./configuration-sections";
import { ErrorState } from "@/components/feedback/error-state";
import { SettingsNote } from "@/components/layout/settings-section";
import { Laptop } from "lucide-react";

export function ConfigurationStatus({
  available,
  agentId,
  section,
  pending,
  error,
  onRetry,
}: {
  available: boolean;
  agentId?: string;
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
            ? `Open this agent in the Substrate desktop app to see the ${section === "skills" ? "skills" : "MCP servers"} in its folder.`
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
      {error && <ErrorState compact title="Couldn’t read this agent’s files" onRetry={onRetry} />}
    </>
  );
}

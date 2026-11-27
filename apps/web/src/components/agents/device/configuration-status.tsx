import type { AgentSection } from "../editors/agent-form";
import { ConfigurationListLoading } from "./configuration-sections";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { Laptop } from "lucide-react";

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
  if (!available)
    return (
      <ContentNotice
        variant="inline"
        icon={Laptop}
        title={unavailableTitle(agentId, homeDeviceName)}
      />
    );
  if (error)
    return (
      <ErrorState variant="compact" title="Couldn’t read this agent’s files" onRetry={onRetry} />
    );
  if (pending)
    return (
      <div role="status" aria-label="Reading the agent’s files">
        <div aria-hidden="true">
          <ConfigurationListLoading section={section} />
        </div>
      </div>
    );
  return null;
}

/** Skills and MCP servers are edited only on the agent's home desktop. */
function unavailableTitle(agentId: string | undefined, homeDeviceName: string | undefined) {
  if (!agentId) return "Save the agent first";
  if (homeDeviceName) return `Edit on ${homeDeviceName}`;
  return "Choose a home desktop in run settings";
}

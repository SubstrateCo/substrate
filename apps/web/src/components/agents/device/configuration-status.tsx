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
  let title = "Choose a home desktop in run settings";
  if (!agentId) title = "Save the agent first";
  else if (homeDeviceName) title = `Edit on ${homeDeviceName}`;
  return (
    <>
      {!available && <ContentNotice variant="inline" icon={Laptop} title={title} />}
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

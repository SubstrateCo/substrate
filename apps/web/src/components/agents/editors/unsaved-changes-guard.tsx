import {
  isAgentSettingsSection,
  listSections,
  type AgentSettingsSection,
} from "@/components/agent-work/app/agent-sections";
import { UnsavedChangesGuard as DraftGuard } from "@/components/feedback/unsaved-changes-guard";

const agentsRoute = "/_authenticated/_frame/_workspace/agents";

/**
 * Asks before leaving an agent's settings with an unsaved draft, and names the sections that hold
 * it. Moving between the agent's settings sections keeps the draft, so it does not ask. A
 * workspace switch or sign-out asks too.
 */
export function UnsavedChangesGuard({
  sections,
  agentId,
}: {
  /** The settings sections with unsaved changes. */
  sections: readonly AgentSettingsSection[];
  agentId: string;
}) {
  return (
    <DraftGuard
      dirty={sections.length > 0}
      description={`Your changes in ${listSections(sections)} aren’t saved.`}
      shouldBlock={({ next }) => {
        if (next.routeId !== agentsRoute) return true;
        return !(next.search.agentId === agentId && isAgentSettingsSection(next.search.section));
      }}
    />
  );
}

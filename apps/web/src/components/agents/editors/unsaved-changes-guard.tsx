import { useBlocker } from "@tanstack/react-router";

import { isAgentSettingsSection } from "@/components/agent-work/app/agent-sections";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

const agentsRoute = "/_authenticated/_frame/_workspace/agents";

/**
 * Asks before leaving an agent's settings with an unsaved draft. Moving between the agent's
 * settings sections keeps the draft, so it does not ask.
 */
export function UnsavedChangesGuard({
  dirty,
  agentId,
  definitionDirty,
  runSettingsDirty,
}: {
  dirty: boolean;
  agentId: string;
  definitionDirty: boolean;
  runSettingsDirty: boolean;
}) {
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => {
      if (next.routeId !== agentsRoute) return true;
      return !(next.search.agentId === agentId && isAgentSettingsSection(next.search.section));
    },
    disabled: !dirty,
    // Not on unload: Electron would cancel closing the window without asking.
    enableBeforeUnload: false,
    withResolver: true,
  });
  if (blocker.status !== "blocked") return null;
  let description = "Your changes to this agent’s name, model, or instructions aren’t saved.";
  if (definitionDirty && runSettingsDirty)
    description = "Your agent and run settings changes aren’t saved.";
  else if (runSettingsDirty) description = "Your run settings changes aren’t saved.";
  return (
    <ConfirmDialog
      title="Discard unsaved changes?"
      description={description}
      confirmLabel="Discard changes"
      pendingLabel="Discarding…"
      cancelLabel="Keep editing"
      destructive
      onConfirm={blocker.proceed}
      onClose={blocker.reset}
    />
  );
}

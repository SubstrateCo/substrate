import { type ReactNode } from "react";

import { WorkspaceLinkPrompt } from "@/components/workspace/workspace-link-prompt";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";

export function WorkspaceLinkBoundary({
  organizationId,
  workspaceId,
  children,
}: {
  organizationId: string;
  /** The workspace a link was made in. */
  workspaceId?: string;
  children: ReactNode;
}) {
  const change = useActivateOrganization(null);
  if (!workspaceId || workspaceId === organizationId) return children;
  return (
    <WorkspaceLinkPrompt
      pending={change.isPending}
      error={change.error}
      onSwitch={() => change.mutate(workspaceId)}
    />
  );
}

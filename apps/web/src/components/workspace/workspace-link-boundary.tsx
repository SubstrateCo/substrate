import { useNavigate } from "@tanstack/react-router";

import { useEffect, type ReactNode } from "react";

import { WorkspaceLinkPrompt } from "@/components/workspace/workspace-link-prompt";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";

export function WorkspaceLinkBoundary({
  organizationId,
  workspaceId,
  children,
}: {
  organizationId: string;
  workspaceId?: string;
  children: ReactNode;
}) {
  const change = useActivateOrganization(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!workspaceId)
      void navigate({
        to: ".",
        search: (previous) => ({ ...previous, workspaceId: organizationId }),
        hash: true,
        replace: true,
        resetScroll: false,
      });
  }, [navigate, organizationId, workspaceId]);
  if (!workspaceId || workspaceId === organizationId) return children;
  return (
    <WorkspaceLinkPrompt
      pending={change.isPending}
      error={change.error}
      onSwitch={() => change.mutate(workspaceId)}
    />
  );
}

import { useSearch } from "@tanstack/react-router";

import { type ReactNode } from "react";

import { WorkspaceLinkPrompt } from "@/components/workspace/workspace-link-prompt";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";

export function WorkspaceLinkBoundary({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const search = useSearch({ strict: false });
  const change = useActivateOrganization(null);
  if (!search.workspaceId || search.workspaceId === organizationId) return children;
  return (
    <WorkspaceLinkPrompt
      pending={change.isPending}
      error={change.error}
      onSwitch={() => change.mutate(search.workspaceId!)}
    />
  );
}

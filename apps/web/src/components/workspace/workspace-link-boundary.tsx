import { useMutation } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { type ReactNode } from "react";

import { WorkspaceLinkPrompt } from "@/components/workspace/workspace-link-prompt";
import { activateOrganization } from "@/lib/auth/organization";

export function WorkspaceLinkBoundary({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const search = useSearch({ strict: false });
  const change = useMutation({
    mutationFn: () => activateOrganization(search.workspaceId!, null),
  });
  if (!search.workspaceId || search.workspaceId === organizationId) return children;
  return (
    <WorkspaceLinkPrompt
      pending={change.isPending}
      error={change.error}
      onSwitch={() => change.mutate()}
    />
  );
}

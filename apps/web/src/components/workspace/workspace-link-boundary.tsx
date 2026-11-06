import { type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { WorkspaceLinkPrompt } from "@startup-os/ui/workspace/workspace-link-prompt";
import { authClient } from "@/lib/auth-client";
import { unwrap } from "@/queries/organizations/options";

export function WorkspaceLinkBoundary({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const search = useSearch({ strict: false });
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: async () => {
      unwrap(await authClient.organization.setActive({ organizationId: search.workspaceId! }));
      await client.cancelQueries();
      client.clear();
      window.location.reload();
    },
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

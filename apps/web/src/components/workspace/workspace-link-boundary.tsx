import { type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Button } from "@startup-os/ui/primitives/button";
import { FormMessage } from "@startup-os/ui/auth/form-message";
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
    <section className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">This link belongs to another workspace</h1>
      <p>Switch to that workspace to open it. You must be a member.</p>
      <Button disabled={change.isPending} onClick={() => change.mutate()}>
        {change.isPending ? "Switching workspace…" : "Switch workspace to open link"}
      </Button>
      <FormMessage
        error={change.error}
        errorDescription="This workspace is unavailable or you are not a member."
      />
    </section>
  );
}

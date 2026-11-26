import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authResult } from "./result";
import { authClient } from "@/api/auth-client";
import { useAuth } from "@/auth/provider";
import { queryKeys } from "@/queries/keys";

export function useWorkspaces(onSelect: (id: string) => void, invitationId?: string) {
  const client = useQueryClient();
  const { session, setActiveOrganization, signOut } = useAuth();
  const accountKey = queryKeys.account(session?.user.id ?? "");
  const enabled = !!session?.user.emailVerified;
  const organizations = useQuery({
    queryKey: [...accountKey, "organizations"],
    enabled,
    queryFn: async () => authResult(await authClient.organization.list()),
  });
  const invitations = useQuery({
    queryKey: [...accountKey, "user-invitations"],
    enabled,
    queryFn: async () => authResult(await authClient.organization.listUserInvitations()),
  });
  const invitation = useQuery({
    queryKey: [...accountKey, "invitation", invitationId],
    retry: false,
    queryFn:
      enabled && invitationId
        ? async () =>
            authResult(await authClient.organization.getInvitation({ query: { id: invitationId } }))
        : skipToken,
  });
  const action = useMutation({
    mutationFn: async (
      input:
        | { kind: "select"; id: string }
        | { kind: "accept"; id: string }
        | { kind: "create"; name: string },
    ) => {
      const session = authResult(await authClient.getSession());
      if (!session.user.emailVerified)
        throw new Error("Verify your email before opening a workspace.");
      let organizationId: string;
      if (input.kind === "select") {
        organizationId = input.id;
      } else if (input.kind === "accept") {
        const result = authResult(
          await authClient.organization.acceptInvitation({ invitationId: input.id }),
        );
        organizationId = result.member.organizationId;
      } else {
        const name = input.name.trim();
        if (!name) throw new Error("Enter a workspace name.");
        const prefix =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 48) || "workspace";
        const result = authResult(
          await authClient.organization.create({
            name,
            slug: `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          }),
        );
        organizationId = result.id;
      }
      await setActiveOrganization(organizationId);
      return organizationId;
    },
    onSuccess: async (id) => {
      await client.invalidateQueries({ queryKey: accountKey });
      onSelect(id);
    },
    onError: () => {
      // Acceptance or creation can succeed even if activation fails. Reload so it can be selected.
      void client.invalidateQueries({ queryKey: accountKey });
    },
  });
  const leave = useMutation({ mutationFn: signOut });
  return { organizations, invitations, invitation, action, leave };
}

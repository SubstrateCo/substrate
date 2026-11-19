import {
  mutationOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { activateOrganization } from "@/lib/auth/organization";
import { unwrap } from "@/lib/auth/result";
import { queryKeys } from "@/queries/keys";

type WorkspaceActivation = { organizationId: string; destination?: string | null };

export function organizationActivationOptions(activate = activateOrganization) {
  // The document exit owns this cache boundary. Keeping a draft must not switch the session
  // or refresh the current cache; leaving gives the new document its own cache.
  const activateTarget = ({ organizationId, destination }: WorkspaceActivation) =>
    activate(organizationId, destination);
  return {
    switchTo: (destination?: string | null) =>
      mutationOptions({
        mutationFn: (organizationId: string) => activateTarget({ organizationId, destination }),
      }),
    openLinked: mutationOptions({
      mutationFn: (target: { organizationId: string; destination: string }) =>
        activateTarget(target),
    }),
  };
}

export function useActivateOrganization(destination?: string | null) {
  return useMutation(organizationActivationOptions().switchTo(destination));
}

export function createOrganizationMutationOptions(client: QueryClient) {
  return {
    mutationFn: async (input: { name: string; slug: string }) =>
      unwrap(await authClient.organization.create(input)),
    // Creation also sets the active organization, even if opening the new document fails.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.organizations }),
        client.invalidateQueries({ queryKey: queryKeys.session }),
      ]),
  };
}

export function acceptInvitationMutationOptions(client: QueryClient, invitationId: string) {
  return {
    mutationFn: async () =>
      unwrap(await authClient.organization.acceptInvitation({ invitationId })),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.organizations }),
        client.invalidateQueries({ queryKey: queryKeys.session }),
        client.invalidateQueries({ queryKey: queryKeys.userInvitations }),
        client.invalidateQueries({ queryKey: queryKeys.invitation(invitationId), exact: true }),
      ]),
  };
}

export function useCreateOrganization() {
  return useMutation(createOrganizationMutationOptions(useQueryClient()));
}

export function useAcceptInvitation(invitationId: string) {
  return useMutation(acceptInvitationMutationOptions(useQueryClient(), invitationId));
}

import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { activateOrganization } from "@/lib/auth/organization";
import { unwrap } from "@/lib/auth/result";

export function useActivateOrganization(destination?: string | null) {
  return useMutation({
    mutationFn: (organizationId: string) => activateOrganization(organizationId, destination),
  });
}

export function useCreateOrganization() {
  return useMutation({
    mutationFn: async (input: { name: string; slug: string }) =>
      unwrap(await authClient.organization.create(input)),
  });
}

export function useAcceptInvitation(invitationId: string) {
  return useMutation({
    mutationFn: async () =>
      unwrap(await authClient.organization.acceptInvitation({ invitationId })),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { authClient } from "@/api/auth/client";
import { startGoogleLink } from "@/lib/integrations/google-link";

export function useCalendarAccountLink() {
  return useMutation({ mutationFn: () => startGoogleLink("calendar") });
}

export function useUnlinkCalendarAccount(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (credentialAccountId: string) => {
      const result = await authClient.unlinkAccount({ accountId: credentialAccountId });
      if (result.error) throw new Error("Account unlink failed.");
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.calendar(organizationId) }),
  });
}

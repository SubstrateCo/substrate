import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { authClient } from "@/api/auth/client";
import { startGoogleLink } from "@/lib/integrations/google-link";

/**
 * Links a Google account with calendar access, or asks again for access an account lacks. On the
 * desktop the system browser goes straight to Google and returns to Settings → Calendars here.
 */
export function useCalendarAccountLink() {
  return useMutation({ mutationFn: () => startGoogleLink("calendar") });
}

/** Unlinks a provider account. Its calendars move to the detached list and keep their history. */
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

import { useQueryClient } from "@tanstack/react-query";

import { messagingKeys } from "../keys";
import { useMessagingScope } from "../scope";

export function useRefreshMessaging(organizationId: string) {
  const scope = useMessagingScope(organizationId);
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: messagingKeys.all(scope) }),
      client.invalidateQueries({ queryKey: messagingKeys.searchAll(scope) }),
    ]);
}

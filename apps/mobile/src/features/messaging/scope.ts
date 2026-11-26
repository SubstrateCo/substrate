import { authClient } from "@/api/auth-client";
import type { QueryScope } from "@/queries/keys";

export function useMessagingScope(organizationId: string): QueryScope {
  // The shell renders messaging only for a signed-in account.
  const userId = authClient.useSession().data?.user.id ?? "";
  return { userId, organizationId };
}

import { authClient } from "@/api/auth-client";
import type { QueryScope } from "@/queries/keys";

export function useMessagingScope(organizationId: string): QueryScope {
  const userId = authClient.useSession().data?.user.id ?? "";
  return { userId, organizationId };
}

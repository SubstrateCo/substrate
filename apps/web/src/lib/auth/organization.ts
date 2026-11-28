import { authClient } from "@/api/auth/client";
import { unwrap } from "@/api/auth/result";
import { leaveDocument } from "@/lib/navigation/unsaved-drafts";

export function activateOrganization(
  organizationId: string,
  destination: string | null = "/messages",
) {
  return leaveDocument(destination, async () => {
    unwrap(await authClient.organization.setActive({ organizationId }));
  });
}

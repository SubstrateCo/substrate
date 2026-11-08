import { authClient } from "./client";
import { unwrap } from "./result";

/**
 * Makes a workspace active, then loads a new document. The new document starts with an empty
 * query cache, so no private data from the previous workspace survives. Pass `null` to reload
 * the current address.
 */
export async function activateOrganization(
  organizationId: string,
  destination: string | null = "/dashboard",
) {
  unwrap(await authClient.organization.setActive({ organizationId }));
  if (destination === null) window.location.reload();
  else window.location.assign(destination);
}

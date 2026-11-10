import { authClient } from "./client";
import { unwrap } from "./result";
import { confirmDiscardDrafts } from "@/lib/navigation/unsaved-drafts";

/**
 * Makes a workspace active, then loads a new document. The new document starts with an empty
 * query cache, so no private data from the previous workspace survives. Pass `null` to reload
 * the current address.
 *
 * Unsaved drafts are lost with the old document, so the person decides first. The active
 * workspace changes only after they agree. Resolves `false` when they chose to keep editing.
 */
export async function activateOrganization(
  organizationId: string,
  destination: string | null = "/dashboard",
) {
  if (!(await confirmDiscardDrafts())) return false;
  unwrap(await authClient.organization.setActive({ organizationId }));
  if (destination === null) window.location.reload();
  else window.location.assign(destination);
  return true;
}

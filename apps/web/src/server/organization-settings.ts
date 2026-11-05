import { auth } from "@startup-os/auth/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
import { organizationSettingsAccess } from "@/lib/settings-access";

export const getOrganizationSettingsAccess = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "no-store");
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session?.user.emailVerified || !session.session.activeOrganizationId) return null;
  const organizationId = session.session.activeOrganizationId;
  const member = await auth.api.getActiveMemberRole({ headers, query: { organizationId } });
  const access = organizationSettingsAccess(member.role);
  return access.allowed ? { organizationId, isOwner: access.isOwner } : null;
});

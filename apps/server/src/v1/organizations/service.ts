import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { auth } from "../../auth/server";
import { serviceResult } from "../../shared/service-result";
import type { SessionAPI } from "../session/service";

export interface OrganizationAPI extends SessionAPI {
  getActiveMemberRole(input: {
    headers: Headers;
    query: { organizationId: string };
  }): Promise<{ role: string }>;
}

export function createOrganizationService(api: OrganizationAPI) {
  return {
    settingsAccess(headers: Headers) {
      return serviceResult(async () => {
        const session = await api.getSession({ headers });
        if (!session?.user.emailVerified || !session.session.activeOrganizationId) return null;
        const organizationId = session.session.activeOrganizationId;
        const member = await api.getActiveMemberRole({ headers, query: { organizationId } });
        const access = organizationSettingsAccess(member.role);
        return access.allowed ? { organizationId, isOwner: access.isOwner } : null;
      });
    },
  };
}

export const defaultOrganizationService = createOrganizationService(auth.api);
export type OrganizationService = ReturnType<typeof createOrganizationService>;

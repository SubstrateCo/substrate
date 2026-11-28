import type { DesktopScheme } from "@substrate/contracts/desktop/identity";
import { desktopLink } from "@substrate/contracts/desktop/links";
import type { GoogleProduct } from "@substrate/contracts/integrations/google";

import type { GoogleLinkTickets } from "../../auth/google-link";
import type { IdentityScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function createIntegrationService(deps: {
  googleLink: GoogleLinkTickets;
  desktopScheme: DesktopScheme;
}) {
  return {
    createGoogleLinkTicket(scope: IdentityScope, product: GoogleProduct) {
      return serviceResult(() => deps.googleLink.create(scope.session.session, product));
    },
    startGoogleLink(ticket: string) {
      return deps.googleLink.start(ticket);
    },
    returnURL: desktopLink("/settings/user", deps.desktopScheme),
  };
}
export type IntegrationService = ReturnType<typeof createIntegrationService>;

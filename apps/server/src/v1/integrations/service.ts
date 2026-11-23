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
    /** A single-use ticket for the signed-in session to link a Google product in a browser. */
    createGoogleLinkTicket(scope: IdentityScope, product: GoogleProduct) {
      return serviceResult(() => deps.googleLink.create(scope.session.session, product));
    },
    /** Google's consent screen and state cookies, or null when the ticket cannot be used. */
    startGoogleLink(ticket: string) {
      return deps.googleLink.start(ticket);
    },
    /** Where a failed start sends the person: their settings in the desktop app. */
    returnURL: desktopLink("/settings/user", deps.desktopScheme),
  };
}
export type IntegrationService = ReturnType<typeof createIntegrationService>;

import { googleLinkRequest, type GoogleLinkRequest } from "@substrate/contracts/desktop/window-ipc";
import { googleLinkStartURL } from "@substrate/contracts/integrations/google-link";

/**
 * The API page that starts a Google link in the system browser. Main builds it from its own API
 * origin; the renderer sends only the single-use ticket, so it cannot choose what opens.
 */
export function googleLinkURL(request: GoogleLinkRequest, apiURL: string) {
  return googleLinkStartURL(googleLinkRequest.parse(request).ticket, apiURL);
}

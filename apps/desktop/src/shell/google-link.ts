import { googleLinkRequest, type GoogleLinkRequest } from "@substrate/contracts/desktop/window-ipc";
import { googleLinkStartURL } from "@substrate/contracts/integrations/google-link";

export function googleLinkURL(request: GoogleLinkRequest, apiURL: string) {
  return googleLinkStartURL(googleLinkRequest.parse(request).ticket, apiURL);
}

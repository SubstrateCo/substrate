import { googleProductScopes, type GoogleProduct } from "@substrate/contracts/integrations/google";
import { googleProductSettingsPath } from "@substrate/contracts/integrations/google-link";

import { googleConsentURL } from "./google-consent";
import { authClient } from "@/api/auth/client";
import { createGoogleLinkTicket } from "@/api/integrations/google-link";
import { isDesktop } from "@/lib/desktop/auth";
import { windowBridge } from "@/lib/desktop/bridges";

async function navigateToGoogleConsent(product: GoogleProduct, callbackURL: string) {
  const result = await authClient.linkSocial({
    provider: "google",
    scopes: [...googleProductScopes[product]],
    callbackURL,
  });
  if (result.error) throw new Error("Google link failed.");
  window.location.assign(googleConsentURL(result.data.url));
}

export async function startGoogleLink(product: GoogleProduct) {
  if (isDesktop()) {
    const bridge = windowBridge();
    if (!bridge) throw new Error("Desktop Google linking is unavailable.");
    const { ticket } = await createGoogleLinkTicket({ data: { product } });
    return bridge.openGoogleLink({ ticket });
  }
  await navigateToGoogleConsent(
    product,
    new URL(googleProductSettingsPath[product], window.location.origin).toString(),
  );
}

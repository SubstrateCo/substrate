import { googleProductScopes, type GoogleProduct } from "@substrate/contracts/integrations/google";
import { googleProductSettingsPath } from "@substrate/contracts/integrations/google-link";

import { googleConsentURL } from "./google-consent";
import { authClient } from "@/api/auth/client";
import { createGoogleLinkTicket } from "@/api/integrations/google-link";
import { isDesktop } from "@/lib/desktop/auth";
import { windowBridge } from "@/lib/desktop/bridges";

/**
 * Starts a Google link that asks for one product's scopes, then returns to `callbackURL`. The
 * server adds the identity scopes, offline access, consent, and earlier grants. Linking an
 * account again adds the product to it.
 *
 * Call it in the browser that will complete the OAuth callback: the state cookie belongs there.
 * The auth client runs without its redirect plugin, so this navigates to Google itself.
 */
export async function linkGoogleProduct(product: GoogleProduct, callbackURL: string) {
  const result = await authClient.linkSocial({
    provider: "google",
    scopes: [...googleProductScopes[product]],
    callbackURL,
  });
  if (result.error) throw new Error("Google link failed.");
  window.location.assign(googleConsentURL(result.data.url));
}

/**
 * Links a Google account for a product, or asks again for access an account lacks.
 *
 * In the web app, Google returns to the product's settings page in this tab. The desktop must
 * finish OAuth in the system browser, which has no Substrate session: it asks the server for a
 * single-use ticket, and desktop main opens the API start page with it. That page goes straight
 * to Google, and Google returns through /desktop/open, which reopens the settings page here.
 */
export async function startGoogleLink(product: GoogleProduct) {
  if (isDesktop()) {
    const bridge = windowBridge();
    if (!bridge) throw new Error("Desktop Google linking is unavailable.");
    const { ticket } = await createGoogleLinkTicket({ data: { product } });
    return bridge.openGoogleLink({ ticket });
  }
  await linkGoogleProduct(
    product,
    new URL(googleProductSettingsPath[product], window.location.origin).toString(),
  );
}

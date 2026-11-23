import { isGoogleConsentURL } from "@substrate/contracts/integrations/google-link";

/** The consent screen to navigate to. Throws for anything that is not Google's consent host. */
export function googleConsentURL(value: string | undefined) {
  if (!value || !isGoogleConsentURL(value)) throw new Error("Google link failed.");
  return value;
}

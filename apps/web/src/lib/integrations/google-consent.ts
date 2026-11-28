import { isGoogleConsentURL } from "@substrate/contracts/integrations/google-link";

export function googleConsentURL(value: string | undefined) {
  if (!value || !isGoogleConsentURL(value)) throw new Error("Google link failed.");
  return value;
}

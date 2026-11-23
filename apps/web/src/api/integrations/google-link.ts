import type { GoogleProduct } from "@substrate/contracts/integrations/google";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";

/** A single-use ticket that desktop main exchanges for Google's consent screen in the browser. */
export const createGoogleLinkTicket = ({ data, signal }: ApiInput<{ product: GoogleProduct }>) =>
  readResult(api.integrations.google["link-tickets"].$post({ json: data }, { init: { signal } }));

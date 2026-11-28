import type { ApiInput } from "@substrate/contracts/http-result";
import type { GoogleProduct } from "@substrate/contracts/integrations/google";

import { api } from "../client";
import { readResult } from "../result";

export const createGoogleLinkTicket = ({ data, signal }: ApiInput<{ product: GoogleProduct }>) =>
  readResult(api.integrations.google["link-tickets"].$post({ json: data }, { init: { signal } }));

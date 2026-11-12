import type { CrmFromMessageInput } from "@substrate/contracts/crm/from-message";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";

export const createCrmFromMessage = ({ data, signal }: ApiInput<CrmFromMessageInput>) =>
  readResult(api.crm["from-message"].$post({ json: data }, { init: { signal } }));

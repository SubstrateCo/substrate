import type { CrmFromMessageInput } from "@substrate/contracts/crm/from-message";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

export const createCrmFromMessage = ({ data, signal }: ApiInput<CrmFromMessageInput>) =>
  readResult(api.crm["from-message"].$post({ json: data }, { init: { signal } }));

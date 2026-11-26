import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

export const getCrmPeople = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.crm.people.$get({ query: data }, { init: { signal } }));

export const getCrmGrants = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm.grants.$get({ query: data }, { init: { signal } }));

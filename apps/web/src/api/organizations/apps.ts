import type { AppId } from "@substrate/contracts/apps";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

export const getOrganizationApps = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.organizations.apps.$get({ query: data }, { init: { signal } }));

export const updateOrganizationApps = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; enabledApps: AppId[] }>) =>
  readResult(api.organizations.apps.$patch({ json: data }, { init: { signal } }));

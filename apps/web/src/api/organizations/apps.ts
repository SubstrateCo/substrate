import type { OrganizationAppId, UserAppId } from "@substrate/contracts/apps";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

export const getOrganizationApps = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.organizations.apps.$get({ query: data }, { init: { signal } }));

export const updateOrganizationApps = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; enabledApps: OrganizationAppId[] }>) =>
  readResult(api.organizations.apps.$patch({ json: data }, { init: { signal } }));

export const updatePersonalApp = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; appId: UserAppId; enabled: boolean }>) =>
  readResult(api.organizations.apps.user.$patch({ json: data }, { init: { signal } }));

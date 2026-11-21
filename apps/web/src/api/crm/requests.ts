import type { CrmTimelineMode, CrmWrite } from "@substrate/contracts/crm/input";

import { api, type ApiInput } from "../client";
import type { RecordListInput } from "../records/input";
import { readResult } from "../result";

export const listAccounts = ({ data, signal }: ApiInput<RecordListInput>) =>
  readResult(api.crm.accounts.$get({ query: { ...data, limit: "100" } }, { init: { signal } }));
export const listDeals = ({ data, signal }: ApiInput<RecordListInput>) =>
  readResult(api.crm.deals.$get({ query: { ...data, limit: "100" } }, { init: { signal } }));
export const getAccount = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm.account.$get({ query: data }, { init: { signal } }));
export const getDeal = ({ data, signal }: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm.deal.$get({ query: data }, { init: { signal } }));
export const getPipeline = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.crm.pipeline.$get({ query: data }, { init: { signal } }));
export const getHomeDeals = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; today: string }>) =>
  readResult(api.crm.home.$get({ query: data }, { init: { signal } }));
export const getFollowUps = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm["follow-ups"].$get({ query: data }, { init: { signal } }));
export const getCrmSettings = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.crm.settings.$get({ query: data }, { init: { signal } }));
export const getCrmTimeline = ({
  data,
  signal,
}: ApiInput<{
  organizationId: string;
  entityId: string;
  mode: CrmTimelineMode;
  beforeOccurredAt?: string;
  beforeEntityId?: string;
}>) => readResult(api.crm.timeline.$get({ query: { ...data, limit: "50" } }, { init: { signal } }));
export const mutateCrm = ({ data, signal }: ApiInput<CrmWrite>) =>
  readResult(api.crm.mutations.$post({ json: data }, { init: { signal } }));

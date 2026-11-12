import type { CrmWrite } from "@substrate/contracts/crm/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";

export type CrmListInput = {
  organizationId: string;
  search?: string;
  archived?: "active" | "archived" | "all";
  afterEntityId?: string;
};
export const listAccounts = ({ data, signal }: ApiInput<CrmListInput>) =>
  readResult(api.crm.accounts.$get({ query: { ...data, limit: "100" } }, { init: { signal } }));
export const listContacts = ({ data, signal }: ApiInput<CrmListInput>) =>
  readResult(api.crm.contacts.$get({ query: { ...data, limit: "100" } }, { init: { signal } }));
export const listDeals = ({ data, signal }: ApiInput<CrmListInput>) =>
  readResult(api.crm.deals.$get({ query: { ...data, limit: "100" } }, { init: { signal } }));
export const getAccount = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm.account.$get({ query: data }, { init: { signal } }));
export const getContact = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm.contact.$get({ query: data }, { init: { signal } }));
export const getDeal = ({ data, signal }: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.crm.deal.$get({ query: data }, { init: { signal } }));
export const getPipeline = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.crm.pipeline.$get({ query: data }, { init: { signal } }));
export const listInteractions = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; contactEntityId: string }>) =>
  readResult(api.crm.interactions.$get({ query: data }, { init: { signal } }));
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
  mode: "participants" | "linked";
  beforeOccurredAt?: string;
  beforeEntityId?: string;
}>) => readResult(api.crm.timeline.$get({ query: { ...data, limit: "50" } }, { init: { signal } }));
export const mutateCrm = ({ data, signal }: ApiInput<CrmWrite>) =>
  readResult(api.crm.mutations.$post({ json: data }, { init: { signal } }));

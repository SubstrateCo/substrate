import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getAccount,
  getContact,
  getDeal,
  getPipeline,
  listAccounts,
  listContacts,
  listDeals,
  listInteractions,
  getFollowUps,
  getCrmSettings,
  getCrmTimeline,
} from "@/api/crm/requests";

export const accountsOptions = (
  organizationId: string,
  search = "",
  archived = false,
  afterEntityId?: string,
) =>
  queryOptions({
    queryKey: queryKeys.crmList(organizationId, "accounts", search, archived, afterEntityId),
    queryFn: ({ signal }) =>
      listAccounts({
        data: { organizationId, search, archived: archived ? "archived" : "active", afterEntityId },
        signal,
      }),
    retry: false,
  });
export const contactsOptions = (
  organizationId: string,
  search = "",
  archived = false,
  afterEntityId?: string,
) =>
  queryOptions({
    queryKey: queryKeys.crmList(organizationId, "contacts", search, archived, afterEntityId),
    queryFn: ({ signal }) =>
      listContacts({
        data: { organizationId, search, archived: archived ? "archived" : "active", afterEntityId },
        signal,
      }),
    retry: false,
  });
export const dealsOptions = (
  organizationId: string,
  search = "",
  archived = false,
  afterEntityId?: string,
) =>
  queryOptions({
    queryKey: queryKeys.crmList(organizationId, "deals", search, archived, afterEntityId),
    queryFn: ({ signal }) =>
      listDeals({
        data: { organizationId, search, archived: archived ? "archived" : "active", afterEntityId },
        signal,
      }),
    retry: false,
  });
export const accountOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.crmRecord(organizationId, "accounts", entityId),
    queryFn: ({ signal }) => getAccount({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const contactOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.crmRecord(organizationId, "contacts", entityId),
    queryFn: ({ signal }) => getContact({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const dealOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.crmRecord(organizationId, "deals", entityId),
    queryFn: ({ signal }) => getDeal({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const pipelineOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.crmPipeline(organizationId),
    queryFn: ({ signal }) => getPipeline({ data: { organizationId }, signal }),
    retry: false,
  });
export const interactionsOptions = (organizationId: string, contactEntityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.crmRecord(organizationId, "contacts", contactEntityId), "interactions"],
    queryFn: ({ signal }) =>
      listInteractions({ data: { organizationId, contactEntityId }, signal }),
    retry: false,
  });
export const followUpsOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.crm(organizationId), "follow-ups", entityId],
    queryFn: ({ signal }) => getFollowUps({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const crmSettingsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.crm(organizationId), "settings"],
    queryFn: ({ signal }) => getCrmSettings({ data: { organizationId }, signal }),
    retry: false,
  });
export const crmTimelineOptions = (
  organizationId: string,
  entityId: string,
  mode: "participants" | "linked",
  before: { beforeOccurredAt: string; beforeEntityId: string } | null,
) =>
  queryOptions({
    queryKey: [...queryKeys.crm(organizationId), "timeline", entityId, mode, before],
    queryFn: ({ signal }) =>
      getCrmTimeline({ data: { organizationId, entityId, mode, ...before }, signal }),
    retry: false,
  });

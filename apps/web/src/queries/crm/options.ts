import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getAccount,
  getDeal,
  getPipeline,
  listAccounts,
  listDeals,
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
export const pipelineDealLimit = 1000;

export const pipelineDealsOptions = (organizationId: string, search = "") =>
  queryOptions({
    queryKey: [...queryKeys.crmList(organizationId, "deals", search, false), "pipeline"],
    queryFn: async ({ signal }) => {
      const deals = [];
      let afterEntityId: string | undefined;
      for (;;) {
        const page = await listDeals({
          data: { organizationId, search, archived: "active", afterEntityId, outcome: "open" },
          signal,
        });
        deals.push(...page);
        afterEntityId = page.at(-1)?.entityId;
        if (page.length < 100 || !afterEntityId || deals.length >= pipelineDealLimit)
          return { deals, truncated: page.length === 100 };
      }
    },
    retry: false,
  });
export const accountOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.crmRecord(organizationId, "accounts", entityId),
    queryFn: ({ signal }) => getAccount({ data: { organizationId, entityId }, signal }),
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
  mode: CrmTimelineMode,
  before: { beforeOccurredAt: string; beforeEntityId: string } | null,
) =>
  queryOptions({
    queryKey: [...queryKeys.crm(organizationId), "timeline", entityId, mode, before],
    queryFn: ({ signal }) =>
      getCrmTimeline({ data: { organizationId, entityId, mode, ...before }, signal }),
    retry: false,
  });

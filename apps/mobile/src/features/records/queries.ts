import type { ContactWrite } from "@substrate/contracts/contacts/input";
import type { InteractionWrite } from "@substrate/contracts/context/interactions";
import type { CrmWrite } from "@substrate/contracts/crm/input";
import type { TasksWrite } from "@substrate/contracts/tasks/input";

import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import {
  interactionPeriod,
  type InteractionDays,
  type InteractionOrigin,
} from "./interactions/interaction-filters";
import { refreshRecords } from "./invalidation";
import { createRecord, recordRequests } from "./requests";
import { authClient } from "@/api/auth-client";
import { queryKeys, type QueryScope } from "@/queries/keys";

const pageLimit = 100;
/** The first page of a cursor list, typed as the cursor later pages use. */
const noCursor = <T>(): T | undefined => undefined;
type Archive = "active" | "archived";
type ListRead<Row> = (
  input: { organizationId: string; search: string; archived: Archive; afterEntityId?: string },
  options: { signal: AbortSignal },
) => Promise<Row[]>;

/** A searchable record list, read in pages after the last entity of the page before. */
function searchPages<Row, Key extends QueryKey>(
  scope: QueryScope,
  queryKey: Key,
  { search, archived }: { search: string; archived: Archive },
  read: ListRead<Row>,
  entityIdOf: (row: Row) => string,
) {
  // oxlint-disable-next-line @tanstack/query/exhaustive-deps -- each caller builds the key from this scope, search and archive.
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ signal, pageParam }) =>
      read(
        { organizationId: scope.organizationId, search, archived, afterEntityId: pageParam },
        { signal },
      ),
    initialPageParam: noCursor<string>(),
    getNextPageParam: (page) => (page.length === pageLimit ? entityIdOf(page.at(-1)!) : undefined),
    retry: false,
  });
}

/** The account and workspace every record query is keyed by. */
export function useRecordScope(organizationId: string): QueryScope {
  const { data } = authClient.useSession();
  return { userId: data?.user.id ?? "", organizationId };
}

const domain = (scope: QueryScope, name: "apps" | "tasks" | "crm" | "contacts" | "interactions") =>
  queryKeys.domain(scope, name);

export const recordQueries = {
  apps: (scope: QueryScope) =>
    queryOptions({
      queryKey: domain(scope, "apps"),
      queryFn: ({ signal }) =>
        recordRequests.apps({ organizationId: scope.organizationId }, { signal }),
      staleTime: 30_000,
      retry: false,
    }),
  projects: (scope: QueryScope, archived: Archive = "active") =>
    queryOptions({
      queryKey: queryKeys.list(scope, "tasks", { projects: archived }),
      queryFn: ({ signal }) =>
        recordRequests.projects({ organizationId: scope.organizationId, archived }, { signal }),
      retry: false,
    }),
  // Without a project, nothing is read. The placeholder stays only in the key.
  project: (scope: QueryScope, projectEntityId: string | undefined) =>
    queryOptions({
      queryKey: queryKeys.detail(scope, "tasks", projectEntityId ?? ""),
      queryFn: projectEntityId
        ? ({ signal }) =>
            recordRequests.project(
              { organizationId: scope.organizationId, projectEntityId },
              { signal },
            )
        : skipToken,
      retry: false,
    }),
  taskLocation: (scope: QueryScope, taskEntityId: string) =>
    queryOptions({
      queryKey: [...queryKeys.detail(scope, "tasks", taskEntityId), "location"],
      queryFn: ({ signal }) =>
        recordRequests.taskLocation(
          { organizationId: scope.organizationId, taskEntityId },
          { signal },
        ),
      staleTime: Infinity,
      retry: false,
    }),
  contacts: (scope: QueryScope, search: string, archived: Archive = "active") =>
    searchPages(
      scope,
      queryKeys.list(scope, "contacts", { search, archived }),
      { search, archived },
      recordRequests.contacts,
      (row) => row.contact.entityId,
    ),
  contact: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: queryKeys.detail(scope, "contacts", entityId),
      queryFn: ({ signal }) =>
        recordRequests.contact({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
  accounts: (scope: QueryScope, search: string, archived: Archive = "active") =>
    searchPages(
      scope,
      queryKeys.list(scope, "crm", { accounts: archived, search }),
      { search, archived },
      recordRequests.accounts,
      (row) => row.entityId,
    ),
  account: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: queryKeys.detail(scope, "crm", entityId),
      queryFn: ({ signal }) =>
        recordRequests.account({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
  /** Deals by search. Closed deals are included, so the list can show won and lost ones. */
  deals: (scope: QueryScope, search: string, archived: Archive = "active") =>
    searchPages(
      scope,
      queryKeys.list(scope, "crm", { deals: archived, search }),
      { search, archived },
      recordRequests.deals,
      (row) => row.entityId,
    ),
  deal: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: queryKeys.detail(scope, "crm", entityId),
      queryFn: ({ signal }) =>
        recordRequests.deal({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
  /** Every open deal for the pipeline board, up to 1000, read in pages of 100. */
  pipelineDeals: (scope: QueryScope) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "crm", { view: "pipeline-deals" }),
      queryFn: async ({ signal }) => {
        const deals = [];
        let afterEntityId: string | undefined;
        for (;;) {
          const page = await recordRequests.deals(
            {
              organizationId: scope.organizationId,
              archived: "active",
              outcome: "open",
              afterEntityId,
            },
            { signal },
          );
          deals.push(...page);
          afterEntityId = page.at(-1)?.entityId;
          if (page.length < pageLimit || !afterEntityId || deals.length >= 1000)
            return { deals, truncated: page.length === pageLimit };
        }
      },
      retry: false,
    }),
  pipeline: (scope: QueryScope) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "crm", { view: "pipeline" }),
      queryFn: ({ signal }) =>
        recordRequests.pipeline({ organizationId: scope.organizationId }, { signal }),
      retry: false,
    }),
  crmSettings: (scope: QueryScope) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "crm", { view: "settings" }),
      queryFn: ({ signal }) =>
        recordRequests.crmSettings({ organizationId: scope.organizationId }, { signal }),
      retry: false,
    }),
  followUps: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: [...queryKeys.detail(scope, "crm", entityId), "follow-ups"],
      queryFn: ({ signal }) =>
        recordRequests.followUps({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
  crmActivity: (scope: QueryScope, entityId: string) =>
    infiniteQueryOptions({
      queryKey: [...queryKeys.detail(scope, "crm", entityId), "activity"],
      queryFn: ({ signal, pageParam }) =>
        recordRequests.crmActivity(
          { organizationId: scope.organizationId, entityId, before: pageParam },
          { signal },
        ),
      initialPageParam: noCursor<{ createdAt: string; id: string }>(),
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      retry: false,
    }),
  contactInteractions: (scope: QueryScope, contactEntityId: string) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "interactions", { contactEntityId }),
      queryFn: ({ signal }) =>
        recordRequests.contactInteractions(
          { organizationId: scope.organizationId, contactEntityId },
          { signal },
        ),
      retry: false,
    }),
  /** Every readable interaction, newest first, optionally filtered by kind or text. */
  interactionTimeline: (
    scope: QueryScope,
    filters: {
      search: string;
      kind?: "email" | "meeting" | "call" | "message" | "note" | "other";
      accountEntityId?: string;
      contactEntityId?: string;
      days?: InteractionDays;
      origin?: InteractionOrigin;
    },
  ) =>
    infiniteQueryOptions({
      queryKey: queryKeys.list(scope, "interactions", { view: "timeline", ...filters }),
      queryFn: ({ signal, pageParam }) => {
        return recordRequests.interactionTimeline(
          {
            organizationId: scope.organizationId,
            ...interactionPeriod(filters.days ?? "all"),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            search: filters.search || undefined,
            kind: filters.kind,
            accountEntityId: filters.accountEntityId,
            contactEntityId: filters.contactEntityId,
            origin: filters.origin,
            ...pageParam,
          },
          { signal },
        );
      },
      initialPageParam: noCursor<{ beforeOccurredAt: string; beforeEntityId: string }>(),
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      retry: false,
    }),
  interaction: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: queryKeys.detail(scope, "interactions", entityId),
      queryFn: ({ signal }) =>
        recordRequests.interaction({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
};

export function useTasksWrite(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    // SAFETY: adding organizationId back to one member of the union rebuilds that member.
    mutationFn: (data: DistributiveOmit<TasksWrite, "organizationId">) =>
      recordRequests.mutateTasks({ ...data, organizationId: scope.organizationId } as TasksWrite),
    onSuccess: (_result, input) =>
      refreshRecords(
        client,
        scope,
        input.action === "deleteProject" ||
          input.action === "deleteTask" ||
          input.action === "moveTask",
      ),
  });
}

export function useCrmWrite(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    // SAFETY: adding organizationId back to one member of the union rebuilds that member.
    mutationFn: (data: DistributiveOmit<CrmWrite, "organizationId">) =>
      recordRequests.mutateCrm({ ...data, organizationId: scope.organizationId } as CrmWrite),
    onSuccess: () => refreshRecords(client, scope),
  });
}

export function useContactWrite(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    // SAFETY: adding organizationId back to one member of the union rebuilds that member.
    mutationFn: (data: DistributiveOmit<ContactWrite, "organizationId">) =>
      recordRequests.mutateContact({
        ...data,
        organizationId: scope.organizationId,
      } as ContactWrite),
    onSuccess: () => refreshRecords(client, scope),
  });
}

export function useInteractionWrite(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    // SAFETY: adding organizationId back to one member of the union rebuilds that member.
    mutationFn: (data: DistributiveOmit<InteractionWrite, "organizationId">) =>
      recordRequests.mutateInteraction({
        ...data,
        organizationId: scope.organizationId,
      } as InteractionWrite),
    onSuccess: (_result, input) =>
      refreshRecords(client, scope, input.action === "deleteInteraction"),
  });
}

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Creates one kind of record and resolves to its ID. */
function useCreate<Data>(
  scope: QueryScope,
  create: (organizationId: string, data: Data) => Promise<string>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Data) => create(scope.organizationId, data),
    onSuccess: () => refreshRecords(client, scope),
  });
}
export const useCreateContact = (scope: QueryScope) => useCreate(scope, createRecord.contact);
export const useCreateAccount = (scope: QueryScope) => useCreate(scope, createRecord.account);
export const useCreateDeal = (scope: QueryScope) => useCreate(scope, createRecord.deal);
export const useCreateInteraction = (scope: QueryScope) =>
  useCreate(scope, createRecord.interaction);

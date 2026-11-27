import type { InteractionWrite } from "@substrate/contracts/context/interactions";
import type { CrmTimelineMode, CrmWrite } from "@substrate/contracts/crm/input";

import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { refreshRecords } from "../invalidation";
import { recordRequests } from "../requests";
import { messageRecordInput, recordPeople, type MessageRecordDraft } from "./crm-management";
import { timelineCursor } from "./crm-timeline";
import { queryKeys, type QueryScope } from "@/queries/keys";

const firstTimelinePage = (): { beforeOccurredAt: string; beforeEntityId: string } | undefined =>
  undefined;

export const crmQueries = {
  recordLinks: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: [...queryKeys.detail(scope, "crm", entityId), "record-links"],
      queryFn: ({ signal }) =>
        recordRequests.recordLinks({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
  linkTargets: (scope: QueryScope, search: string) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "crm", { view: "link-targets", search }),
      queryFn: ({ signal }) =>
        recordRequests.linkTargets(
          { organizationId: scope.organizationId, query: search },
          { signal },
        ),
      retry: false,
    }),
  timeline: (scope: QueryScope, entityId: string, mode: CrmTimelineMode) =>
    infiniteQueryOptions({
      queryKey: [...queryKeys.detail(scope, "crm", entityId), "timeline", mode],
      queryFn: ({ signal, pageParam }) =>
        recordRequests.crmTimeline(
          { organizationId: scope.organizationId, entityId, mode, ...pageParam },
          { signal },
        ),
      initialPageParam: firstTimelinePage(),
      getNextPageParam: timelineCursor,
      retry: false,
    }),
  organizationPeople: (scope: QueryScope) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "people", { view: "members" }),
      queryFn: ({ signal }) =>
        recordRequests.organizationPeople({ organizationId: scope.organizationId }, { signal }),
      staleTime: 30_000,
      retry: false,
    }),
  crmPeople: (scope: QueryScope) =>
    queryOptions({
      queryKey: queryKeys.list(scope, "crm", { view: "people" }),
      queryFn: ({ signal }) =>
        recordRequests.crmPeople({ organizationId: scope.organizationId }, { signal }),
      staleTime: 30_000,
      retry: false,
    }),
  grants: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: [...queryKeys.detail(scope, "crm", entityId), "grants"],
      queryFn: ({ signal }) =>
        recordRequests.crmGrants({ organizationId: scope.organizationId, entityId }, { signal }),
      retry: false,
    }),
  /** Messages that reference a record, newest kept, shown oldest first. */
  relatedMessages: (scope: QueryScope, entityId: string) =>
    queryOptions({
      queryKey: [...queryKeys.detail(scope, "contacts", entityId), "related-messages"],
      queryFn: ({ signal }) =>
        recordRequests.relatedMessages(
          { organizationId: scope.organizationId, entityId },
          { signal },
        ),
      retry: false,
    }),
};

/** Workspace people who can be chosen for a CRM record, resolved from actor IDs to names. */
export function useRecordPeople(scope: QueryScope) {
  const actors = useQuery(crmQueries.crmPeople(scope));
  const members = useQuery(crmQueries.organizationPeople(scope));
  const error = actors.error ?? members.error;
  return {
    people: error ? [] : recordPeople(actors.data ?? [], members.data ?? []),
    pending: actors.isPending || members.isPending,
    error,
  };
}

/** Owner and access changes. Access changes also change what other lists can show. */
export function useCrmAccessWrite(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Extract<CrmWrite, { action: "assignOwner" | "share" | "revoke" }>) =>
      recordRequests.mutateCrm(data),
    onSuccess: () => refreshRecords(client, scope),
  });
}

/** Creates a CRM record from a message. The server saves the message as the record's source. */
export function useCrmFromMessage(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      requestId,
      draft,
      consentToRecordAudience,
    }: {
      messageId: string;
      requestId: string;
      draft: MessageRecordDraft;
      /** Set only from the reader's confirmation in the UI. */
      consentToRecordAudience: true;
    }) =>
      recordRequests.crmFromMessage(
        messageRecordInput(
          scope.organizationId,
          messageId,
          requestId,
          draft,
          consentToRecordAudience,
        ),
      ),
    onSuccess: () => refreshRecords(client, scope),
  });
}

/** Publishes an approved interaction from a message to a contact's workspace-visible history. */
export function usePublishInteraction(scope: QueryScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        Extract<InteractionWrite, { action: "publishInteraction" }>,
        "action" | "organizationId"
      >,
    ) =>
      recordRequests.mutateInteraction({
        ...data,
        action: "publishInteraction",
        organizationId: scope.organizationId,
      }),
    onSuccess: () => refreshRecords(client, scope),
  });
}

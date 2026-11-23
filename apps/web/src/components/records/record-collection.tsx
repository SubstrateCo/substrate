import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { CrmExport } from "@/components/crm/crm-export";
import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { sectionLabels, singularLabels, type CrmKind } from "@/components/crm/crm-types";
import { DealPipeline, DealPipelineLoading } from "@/components/crm/deal-pipeline";
import { RecordEditor } from "@/components/crm/record-editor";
import { RecordList } from "@/components/crm/record-list";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Pager, useCursorPages, type AppTablePagination } from "@/components/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { contactLink, crmLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { contactsOptions } from "@/queries/contacts/options";
import {
  accountsOptions,
  dealsOptions,
  pipelineOptions,
  crmSettingsOptions,
} from "@/queries/crm/options";
import { useRecordMutation } from "@/queries/records/mutations";
import { cn } from "cn";
import { Plus } from "lucide-react";

const pageSize = 100;

function useCollectionQueries(
  organizationId: string,
  kind: CrmKind,
  { query: search, pending }: ReturnType<typeof useSearchDebounce>,
  archived: boolean,
  afterEntityId: string | undefined,
  creating: boolean,
) {
  const apps = useOrganizationApps();
  const scopedFilters = (section: CrmKind) =>
    kind === section
      ? ([search, archived, afterEntityId] as const)
      : (["", false, undefined] as const);
  const accounts = useQuery({
    ...accountsOptions(organizationId, ...scopedFilters("accounts")),
    enabled: apps.enabled("crm") && !pending && (kind === "accounts" || creating),
  });
  const contacts = useQuery({
    ...contactsOptions(organizationId, ...scopedFilters("contacts")),
    enabled: !pending && (kind === "contacts" || creating),
  });
  const deals = useQuery({
    ...dealsOptions(organizationId, search, archived, afterEntityId),
    enabled: kind === "deals" && !pending,
  });
  const pipeline = useQuery({ ...pipelineOptions(organizationId), enabled: kind === "deals" });
  const settings = useQuery({ ...crmSettingsOptions(organizationId), enabled: kind === "deals" });
  return { accounts, contacts, deals, pipeline, settings };
}

function collectionRecords(
  kind: CrmKind,
  { accounts, contacts, deals, pipeline, settings }: ReturnType<typeof useCollectionQueries>,
) {
  const stages = (resourceState(pipeline).data ?? []).filter((stage) => !stage.retired);
  const accountState = resourceState(accounts);
  const contactState = resourceState(contacts);
  const dealState = resourceState(deals);
  const accountRows = (accountState.data ?? []).map((row) => ({
    entityId: row.entityId,
    name: row.name,
    description: row.domain,
  }));
  const contactRows = (contactState.data ?? []).map(({ contact: row }) => ({
    entityId: row.entityId,
    name: row.displayName,
    description: row.notes,
  }));
  const dealRows = (dealState.data ?? []).map((row) => ({
    ...row,
    name: row.title,
    stageName: stages.find((stage) => stage.id === row.stageId)?.name,
  }));
  return {
    query: { accounts, contacts, deals }[kind],
    state: { accounts: accountState, contacts: contactState, deals: dealState }[kind],
    rows: { accounts: accountRows, contacts: contactRows, deals: dealRows }[kind],
    accountRows,
    contactRows,
    stages,
    canCreate:
      kind !== "deals" ||
      (!pipeline.isPending && !pipeline.error && !settings.isPending && !settings.error),
  };
}

export function RecordCollection({
  organizationId,
  kind,
}: {
  organizationId: string;
  kind: CrmKind;
}) {
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const searchDebounce = useSearchDebounce(
    search,
    JSON.stringify([organizationId, kind, archived]),
  );
  const debounced = {
    ...searchDebounce,
    pending: searchDebounce.pending && (kind !== "deals" || search !== ""),
  };
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [creating, setCreating] = useState(false);
  const pages = useCursorPages<string>();
  const navigate = useNavigate();
  const mutation = useRecordMutation(organizationId, kind);
  const queries = useCollectionQueries(
    organizationId,
    kind,
    debounced,
    archived,
    pages.cursor,
    creating,
  );
  const records = collectionRecords(kind, queries);
  const showPipeline = kind === "deals" && view === "pipeline" && !archived;
  return (
    // The pipeline's columns scroll on their own, so the page does not.
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-6 p-6",
        showPipeline ? "overflow-hidden" : "overflow-y-auto",
      )}
    >
      <RecordCollectionHeader
        organizationId={organizationId}
        kind={kind}
        archived={archived}
        search={debounced.query}
        canCreate={records.canCreate}
        onCreate={() => {
          mutation.reset();
          setCreating(true);
        }}
      />
      <div className={cn("flex flex-col gap-4", showPipeline && "min-h-0 flex-1")}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label={`Search ${kind}`}
            placeholder={`Search ${kind}`}
            className="w-72 max-w-full"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              pages.reset();
            }}
          />
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="crm-archived"
                checked={archived}
                onCheckedChange={(checked) => {
                  setArchived(checked === true);
                  pages.reset();
                }}
              />
              <Label htmlFor="crm-archived">Archived</Label>
            </div>
            {kind === "deals" && (
              <SegmentedControl
                aria-label="Deal view"
                value={view}
                onValueChange={setView}
                options={[
                  { value: "pipeline", label: "Pipeline" },
                  { value: "list", label: "List" },
                ]}
              />
            )}
          </div>
        </div>
        <RecordCollectionResults
          organizationId={organizationId}
          kind={kind}
          records={records}
          queries={queries}
          searchPending={debounced.pending}
          showPipeline={showPipeline}
          pages={pages}
          filtered={debounced.query !== "" || archived}
          onCreate={
            records.canCreate
              ? () => {
                  mutation.reset();
                  setCreating(true);
                }
              : undefined
          }
        />
      </div>
      {creating && (
        <RecordEditor
          kind={kind}
          organizationId={organizationId}
          defaultCurrency={resourceState(queries.settings).data?.defaultCurrency}
          accounts={records.accountRows.map((row) => ({
            value: row.entityId,
            label: row.name,
          }))}
          contacts={records.contactRows.map((row) => ({
            value: row.entityId,
            label: row.name,
          }))}
          stages={records.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setCreating(false)}
          onSubmit={(write) =>
            mutation.mutate(write, {
              onSuccess: (result) => {
                setCreating(false);
                if ("entityId" in result)
                  void navigate(
                    kind === "contacts"
                      ? contactLink(organizationId, result.entityId)
                      : crmLink(organizationId, kind, result.entityId),
                  );
              },
            })
          }
        />
      )}
    </div>
  );
}

function RecordCollectionHeader({
  organizationId,
  kind,
  archived,
  search,
  canCreate,
  onCreate,
}: {
  organizationId: string;
  kind: CrmKind;
  archived: boolean;
  search: string;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const singular = singularLabels[kind];
  return (
    <PageHeader
      title={sectionLabels[kind]}
      description={
        {
          accounts: "Customer businesses and their connected people and pursuits.",
          contacts: "Customer relationships, contact history, and shared context.",
          deals: "Track each pursuit. Keep stages and closed outcomes separate.",
        }[kind]
      }
      actions={
        <>
          <CrmExport
            organizationId={organizationId}
            kind={kind}
            archived={archived ? "archived" : "active"}
            search={search}
          />
          <Button size="sm" disabled={!canCreate} onClick={onCreate}>
            <Plus aria-hidden />
            New {singular}
          </Button>
        </>
      }
    />
  );
}

function RecordCollectionResults({
  organizationId,
  kind,
  records: { query, state, rows, stages },
  queries: { deals, pipeline, settings },
  searchPending,
  showPipeline,
  pages,
  filtered,
  onCreate,
}: {
  organizationId: string;
  kind: CrmKind;
  filtered: boolean;
  onCreate?: () => void;
  records: ReturnType<typeof collectionRecords>;
  queries: ReturnType<typeof useCollectionQueries>;
  searchPending: boolean;
  /** Open deals as a pipeline board instead of a list. */
  showPipeline: boolean;
  pages: ReturnType<typeof useCursorPages<string>>;
}) {
  // One error per failed load: deals also need the pipeline and settings.
  const dealsError = kind === "deals" ? (pipeline.error ?? settings.error) : null;
  // The API returns up to `pageSize` records after a cursor and no total.
  const pagination = {
    mode: "server",
    pageIndex: pages.pageIndex,
    pageSize,
    hasNextPage: rows.length === pageSize,
    onPageChange: (pageIndex: number) => {
      const last = rows.at(-1);
      if (pageIndex < pages.pageIndex) pages.previous();
      else if (last) pages.next(last.entityId);
    },
  } satisfies AppTablePagination;
  return (
    <>
      <CrmResourceState
        noun={kind}
        pending={(searchPending || query.isPending) && !state.data}
        error={(state.data ? null : state.error) ?? dealsError}
        onRetry={() => {
          void query.refetch();
          if (kind !== "deals") return;
          void pipeline.refetch();
          void settings.refetch();
        }}
        loading={
          showPipeline ? (
            <DealPipelineLoading />
          ) : (
            <RecordList organizationId={organizationId} kind={kind} rows={[]} loading />
          )
        }
      />
      {state.status === "stale" && (
        <StaleNotice onRetry={() => void query.refetch()}>
          These records may be out of date.
        </StaleNotice>
      )}
      {state.data &&
        (showPipeline ? (
          <>
            <DealPipeline
              organizationId={organizationId}
              stages={stages}
              deals={(resourceState(deals).data ?? []).filter((deal) => deal.outcome === "open")}
              onCreate={filtered ? undefined : onCreate}
            />
            {(pagination.pageIndex > 0 || pagination.hasNextPage) && (
              <Pager
                name="Deals"
                pageIndex={pagination.pageIndex}
                pageCount={-1}
                canPrevious={pagination.pageIndex > 0}
                canNext={pagination.hasNextPage}
                disabled={query.isFetching}
                onPageChange={pagination.onPageChange}
              />
            )}
          </>
        ) : (
          <RecordList
            organizationId={organizationId}
            kind={kind}
            rows={rows}
            fetching={query.isFetching}
            pagination={pagination}
            filtered={filtered}
            onCreate={onCreate}
          />
        ))}
    </>
  );
}

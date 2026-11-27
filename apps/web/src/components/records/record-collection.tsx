import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState, type ComponentProps, type ReactNode } from "react";

import { CrmExport } from "@/components/crm/crm-export";
import { CrmResourceBoundary } from "@/components/crm/crm-resource-state";
import { sectionLabels, singularLabels, type CrmKind } from "@/components/crm/crm-types";
import {
  DealPipeline,
  DealPipelineLoading,
  type PipelineDeal,
} from "@/components/crm/deals/deal-pipeline";
import { RecordEditor } from "@/components/crm/record-editor";
import { RecordList, type CrmListRow } from "@/components/crm/record-list";
import { FilterBar, type FilterField } from "@/components/filters";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import {
  archivedFromFilterValue,
  recordFilterValue,
  type RecordFilterFieldId,
} from "@/components/records/record-filters";
import { useCursorPages, type AppTablePagination } from "@/components/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { contactLink, crmLink } from "@/lib/navigation/record-links";
import { resourceState, type ResourceState } from "@/lib/resource-state";
import { contactsOptions } from "@/queries/contacts/options";
import {
  accountsOptions,
  dealsOptions,
  pipelineDealLimit,
  pipelineDealsOptions,
  crmSettingsOptions,
} from "@/queries/crm/options";
import { useActiveStages } from "@/queries/crm/stages";
import { keepPageWhileTurning } from "@/queries/page-turn";
import { useRecordMutation } from "@/queries/records/mutations";
import { cn } from "cn";
import { Archive, Plus } from "lucide-react";

const pageSize = 100;

/** Active records are the unfiltered default; Archived shows archived records only. */
const recordFilterFields: FilterField<RecordFilterFieldId>[] = [
  {
    id: "records",
    label: "Records",
    icon: Archive,
    kind: "option",
    options: [
      { value: "active", label: "Active" },
      { value: "archived", label: "Archived" },
    ],
  },
];

type PipelineStage = ComponentProps<typeof DealPipeline>["stages"][number];
type PipelineBoard = { deals: PipelineDeal[]; truncated: boolean };

function useCollectionQueries({
  organizationId,
  kind,
  search: { query: search, pending },
  archived,
  afterEntityId,
  board,
}: {
  organizationId: string;
  kind: CrmKind;
  search: ReturnType<typeof useSearchDebounce>;
  archived: boolean;
  afterEntityId: string | undefined;
  /** The pipeline board reads all open deals instead of one page of deals. */
  board: boolean;
}) {
  const apps = useOrganizationApps();
  const scopedFilters = (section: CrmKind) =>
    kind === section
      ? ([search, archived, afterEntityId] as const)
      : (["", false, undefined] as const);
  // A page turn keeps the current page on screen until the next one arrives.
  const paged = <T extends { queryKey: QueryKey }>(options: T) => ({
    ...options,
    placeholderData: keepPageWhileTurning(options.queryKey),
  });
  const accounts = useQuery({
    ...paged(accountsOptions(organizationId, ...scopedFilters("accounts"))),
    enabled: apps.enabled("crm") && !pending && kind === "accounts",
  });
  const contacts = useQuery({
    ...paged(contactsOptions(organizationId, ...scopedFilters("contacts"))),
    enabled: !pending && kind === "contacts",
  });
  // The list also loads under the board, so switching views shows rows at once.
  const deals = useQuery({
    ...paged(dealsOptions(organizationId, search, archived, afterEntityId)),
    enabled: kind === "deals" && !pending,
  });
  const boardDeals = useQuery({
    ...pipelineDealsOptions(organizationId, search),
    enabled: kind === "deals" && !pending && board,
  });
  const { pipeline, stages } = useActiveStages(organizationId, kind === "deals");
  const settings = useQuery({ ...crmSettingsOptions(organizationId), enabled: kind === "deals" });
  return { accounts, contacts, deals, boardDeals, pipeline, stages, settings };
}

function collectionRecords(
  kind: CrmKind,
  {
    accounts,
    contacts,
    deals,
    pipeline,
    stages,
    settings,
  }: ReturnType<typeof useCollectionQueries>,
) {
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
    stages,
    canCreate:
      kind !== "deals" ||
      (!pipeline.isPending && !pipeline.error && !settings.isPending && !settings.error),
  };
}

export function RecordCollection({ kind }: { kind: CrmKind }) {
  const { organizationId } = useWorkspaceScope();
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
  const showPipeline = kind === "deals" && view === "pipeline" && !archived;
  const queries = useCollectionQueries({
    organizationId,
    kind,
    search: debounced,
    archived,
    afterEntityId: pages.cursor,
    board: showPipeline,
  });
  const records = collectionRecords(kind, queries);
  const boardState = resourceState(queries.boardDeals);
  const startCreating = () => {
    mutation.reset();
    setCreating(true);
  };
  const filtered = debounced.query !== "" || archived;
  const onCreate = records.canCreate ? startCreating : undefined;
  const pagination = collectionPagination(records.rows, pages);
  const shown = showPipeline
    ? {
        query: queries.boardDeals,
        state: boardState,
        loading: <DealPipelineLoading />,
        results: (
          <RecordPipeline
            stages={records.stages}
            board={boardState.data}
            onCreate={filtered ? undefined : onCreate}
          />
        ),
      }
    : {
        query: records.query,
        state: records.state,
        loading: <RecordList kind={kind} rows={[]} pagination={pagination} loading />,
        results: (
          <RecordList
            kind={kind}
            rows={records.rows}
            fetching={records.query.isFetching}
            pagination={pagination}
            filtered={filtered}
            onCreate={onCreate}
          />
        ),
      };
  // One error per failed load: deals also need the pipeline and settings.
  const needed = kind === "deals" ? [queries.pipeline, queries.settings] : [];
  const neededError = needed.find((query) => query.error)?.error ?? null;
  return (
    // The pipeline's columns scroll on their own, so the page does not.
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6",
        showPipeline ? "overflow-hidden" : "overflow-y-auto",
      )}
    >
      <RecordCollectionHeader
        kind={kind}
        archived={archived}
        search={debounced.query}
        canCreate={records.canCreate}
        onCreate={startCreating}
      />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-4", showPipeline && "min-h-0")}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label={`Search ${kind}`}
            placeholder={`Search ${kind}`}
            className="w-full min-w-0 sm:w-72"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              pages.reset();
            }}
          />
          <FilterBar
            fields={recordFilterFields}
            value={recordFilterValue(archived)}
            onValueChange={(value) => {
              const next = archivedFromFilterValue(value);
              if (next === archived) return;
              setArchived(next);
              pages.reset();
            }}
          />
          {kind === "deals" && (
            <div className="ml-auto">
              <SegmentedControl
                aria-label="Deal view"
                value={view}
                onValueChange={setView}
                options={[
                  { value: "pipeline", label: "Pipeline" },
                  { value: "list", label: "List" },
                ]}
              />
            </div>
          )}
        </div>
        <RecordCollectionResults
          kind={kind}
          state={resourceState({
            data: shown.state.data,
            error: shown.state.error ?? neededError,
          })}
          onRetry={() => {
            void shown.query.refetch();
            for (const query of needed) void query.refetch();
          }}
          loading={shown.loading}
        >
          {shown.results}
        </RecordCollectionResults>
      </div>
      {creating && (
        <RecordEditor
          kind={kind}
          defaultCurrency={resourceState(queries.settings).data?.defaultCurrency}
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
  kind,
  archived,
  search,
  canCreate,
  onCreate,
}: {
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
          <CrmExport kind={kind} archived={archived ? "archived" : "active"} search={search} />
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
  kind,
  state,
  onRetry,
  loading,
  children,
}: {
  kind: CrmKind;
  /** The shown records, failed by their own load or by one they need. */
  state: ResourceState<unknown>;
  /** Retries every failed load. */
  onRetry: () => void;
  /** The skeleton of the list or pipeline board. */
  loading: ReactNode;
  /** The loaded list or pipeline board. */
  children: ReactNode;
}) {
  return (
    <CrmResourceBoundary noun={kind} state={state} onRetry={onRetry} loading={loading}>
      {() => children}
    </CrmResourceBoundary>
  );
}

/** The API returns up to `pageSize` records after a cursor and no total. */
function collectionPagination(
  rows: CrmListRow[],
  pages: ReturnType<typeof useCursorPages<string>>,
) {
  return {
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
}

function RecordPipeline({
  stages,
  board,
  onCreate,
}: {
  stages: PipelineStage[];
  board: PipelineBoard | undefined;
  onCreate?: () => void;
}) {
  return (
    <>
      <DealPipeline stages={stages} deals={board?.deals ?? []} onCreate={onCreate} />
      {board?.truncated && (
        <p className="text-sm text-muted-foreground">
          The board shows the first {pipelineDealLimit.toLocaleString()} open deals. Search or use
          the list to find others.
        </p>
      )}
    </>
  );
}

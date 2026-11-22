import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { CrmExport } from "@/components/crm/crm-export";
import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { sectionLabels, singularLabels, type CrmKind } from "@/components/crm/crm-types";
import { DealPipeline, DealPipelineLoading } from "@/components/crm/deal-pipeline";
import { RecordEditor } from "@/components/crm/record-editor";
import { RecordList } from "@/components/crm/record-list";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  const stages = (pipeline.data ?? []).filter((stage) => !stage.retired);
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
  const [cursors, setCursors] = useState<string[]>([]);
  const navigate = useNavigate();
  const mutation = useRecordMutation(organizationId, kind);
  const queries = useCollectionQueries(
    organizationId,
    kind,
    debounced,
    archived,
    cursors.at(-1),
    creating,
  );
  const { deals, pipeline, settings } = queries;
  const { query, state, rows, accountRows, contactRows, stages, canCreate } = collectionRecords(
    kind,
    queries,
  );
  const singular = singularLabels[kind];
  const dealPipelineView = kind === "deals" && view === "pipeline";
  const compactActions = kind !== "contacts";
  const createButton = (
    <Button
      size={compactActions ? "icon-sm" : "sm"}
      variant={compactActions ? "ghost" : "default"}
      aria-label={`New ${singular}`}
      disabled={!canCreate}
      onClick={() => {
        mutation.reset();
        setCreating(true);
      }}
    >
      <Plus aria-hidden />
      {!compactActions && <>New {singular}</>}
    </Button>
  );
  const actions = (
    <>
      <CrmExport
        organizationId={organizationId}
        kind={kind}
        archived={archived ? "archived" : "active"}
        search={debounced.query}
        iconOnly={compactActions}
      />
      {compactActions ? (
        <Tooltip>
          <TooltipTrigger asChild>{createButton}</TooltipTrigger>
          <TooltipContent>New {singular}</TooltipContent>
        </Tooltip>
      ) : (
        createButton
      )}
    </>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
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
          compactActions ? <ButtonGroup aria-label="CRM actions">{actions}</ButtonGroup> : actions
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-72 max-w-full">
          <Input
            aria-label={`Search ${kind}`}
            placeholder={`Search ${kind}…`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCursors([]);
            }}
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="crm-archived"
              checked={archived}
              onCheckedChange={(checked) => {
                setArchived(checked === true);
                setCursors([]);
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
      <CrmResourceState
        pending={(debounced.pending || query.isPending) && !state.data}
        error={query.error}
        onRetry={() => void query.refetch()}
        loading={
          dealPipelineView && !archived ? (
            <DealPipelineLoading />
          ) : (
            <RecordList organizationId={organizationId} kind={kind} rows={[]} loading />
          )
        }
      />
      {kind === "deals" && (
        <>
          <CrmResourceState
            pending={false}
            error={pipeline.error}
            onRetry={() => void pipeline.refetch()}
          />
          <CrmResourceState
            pending={false}
            error={settings.error}
            onRetry={() => void settings.refetch()}
          />
        </>
      )}
      {state.data &&
        !state.error &&
        (dealPipelineView && !archived ? (
          <DealPipeline
            organizationId={organizationId}
            stages={stages}
            deals={(deals.data ?? []).filter((deal) => deal.outcome === "open")}
          />
        ) : (
          <RecordList organizationId={organizationId} kind={kind} rows={rows} />
        ))}
      {!query.error && (
        <RecordPagination
          page={cursors.length + 1}
          rowCount={rows.length}
          fetching={query.isFetching}
          dealPipelineView={dealPipelineView}
          onPrevious={() => setCursors((previous) => previous.slice(0, -1))}
          onNext={() => {
            const last = rows.at(-1);
            if (last) setCursors((previous) => [...previous, last.entityId]);
          }}
        />
      )}
      {creating && (
        <RecordEditor
          kind={kind}
          organizationId={organizationId}
          defaultCurrency={settings.data?.defaultCurrency}
          accounts={accountRows.map((row) => ({
            value: row.entityId,
            label: row.name,
          }))}
          contacts={contactRows.map((row) => ({
            value: row.entityId,
            label: row.name,
          }))}
          stages={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
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

function RecordPagination({
  page,
  rowCount,
  fetching,
  dealPipelineView,
  onPrevious,
  onNext,
}: {
  page: number;
  rowCount: number;
  fetching: boolean;
  dealPipelineView: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Page {page} · up to {pageSize} records
        {dealPipelineView ? " · open deals on this page" : ""}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 1 || fetching} onClick={onPrevious}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={rowCount < pageSize || fetching}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { CrmExport } from "@/components/crm/crm-export";
import { CrmResourceState } from "@/components/crm/crm-resource-state";
import { sectionLabels, singularLabels, type CrmKind } from "@/components/crm/crm-types";
import { DealPipeline } from "@/components/crm/deal-pipeline";
import { RecordEditor } from "@/components/crm/record-editor";
import { RecordList } from "@/components/crm/record-list";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function RecordCollection({
  organizationId,
  kind,
}: {
  organizationId: string;
  kind: CrmKind;
}) {
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const debounced = useSearchDebounce(search, JSON.stringify([organizationId, kind, archived]));
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [creating, setCreating] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const afterEntityId = cursors.at(-1);
  const navigate = useNavigate();
  const mutation = useRecordMutation(organizationId, kind);
  const accounts = useQuery({
    ...accountsOptions(
      organizationId,
      kind === "accounts" ? debounced.query : "",
      kind === "accounts" && archived,
      kind === "accounts" ? afterEntityId : undefined,
    ),
    enabled: !debounced.pending && (kind === "accounts" || creating),
  });
  const contacts = useQuery({
    ...contactsOptions(
      organizationId,
      kind === "contacts" ? debounced.query : "",
      kind === "contacts" && archived,
      kind === "contacts" ? afterEntityId : undefined,
    ),
    enabled: !debounced.pending && (kind === "contacts" || creating),
  });
  const deals = useQuery({
    ...dealsOptions(organizationId, debounced.query, archived, afterEntityId),
    enabled: kind === "deals" && !debounced.pending,
  });
  const pipeline = useQuery({ ...pipelineOptions(organizationId), enabled: kind === "deals" });
  const settings = useQuery({ ...crmSettingsOptions(organizationId), enabled: kind === "deals" });
  const query = { accounts, contacts, deals }[kind];
  const state = {
    accounts: resourceState(accounts),
    contacts: resourceState(contacts),
    deals: resourceState(deals),
  }[kind];
  const stages = (pipeline.data ?? []).filter((stage) => !stage.retired);
  const rows = {
    accounts: (resourceState(accounts).data ?? []).map((row) => ({
      entityId: row.entityId,
      name: row.name,
      description: row.domain,
    })),
    contacts: (resourceState(contacts).data ?? []).map(({ contact: row }) => ({
      entityId: row.entityId,
      name: row.displayName,
      description: row.notes,
    })),
    deals: (resourceState(deals).data ?? []).map((row) => ({
      ...row,
      name: row.title,
      stageName: stages.find((stage) => stage.id === row.stageId)?.name,
    })),
  }[kind];
  const singular = singularLabels[kind];
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
          <>
            <CrmExport
              organizationId={organizationId}
              kind={kind}
              archived={archived ? "archived" : "active"}
              search={debounced.query}
            />
            <Button
              size="sm"
              disabled={
                kind === "deals" &&
                (pipeline.isPending || !!pipeline.error || settings.isPending || !!settings.error)
              }
              onClick={() => {
                mutation.reset();
                setCreating(true);
              }}
            >
              <Plus aria-hidden />
              New {singular}
            </Button>
          </>
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
        pending={debounced.pending || query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
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
        (kind === "deals" && view === "pipeline" && !archived ? (
          <DealPipeline
            organizationId={organizationId}
            stages={stages}
            deals={(deals.data ?? []).filter((deal) => deal.outcome === "open")}
          />
        ) : (
          <RecordList organizationId={organizationId} kind={kind} rows={rows} />
        ))}
      {!query.error && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {cursors.length + 1} · up to 100 records
            {kind === "deals" && view === "pipeline" ? " · open deals on this page" : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!cursors.length || query.isFetching}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length < 100 || query.isFetching}
              onClick={() => {
                const last = rows.at(-1);
                if (last) setCursors((previous) => [...previous, last.entityId]);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {creating && (
        <RecordEditor
          kind={kind}
          organizationId={organizationId}
          defaultCurrency={settings.data?.defaultCurrency}
          accounts={(resourceState(accounts).data ?? []).map((row) => ({
            value: row.entityId,
            label: row.name,
          }))}
          contacts={(resourceState(contacts).data ?? []).map(({ contact: row }) => ({
            value: row.entityId,
            label: row.displayName,
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

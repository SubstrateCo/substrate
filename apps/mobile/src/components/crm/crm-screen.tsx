import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { NewDeal } from "./account-detail";
import { AccountForm } from "./account-form";
import { CrmReports } from "./crm-reports";
import { CrmSettingsSheet } from "./crm-settings";
import { ExportRecords } from "./export-records";
import { PipelineBoard } from "./pipeline";
import { ContactForm } from "@/components/contacts/contact-form";
import { InteractionsScreen } from "@/components/interactions/interactions-screen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useWorkspaceApps } from "@/features/records/apps";
import { crmSection, type CrmSection } from "@/features/records/crm-navigation";
import {
  formatDate,
  formatMoney,
  newRequestId,
  outcomeLabels,
  outcomeTones,
} from "@/features/records/format";
import {
  recordQueries,
  useCreateContact,
  useCreateAccount,
  useRecordScope,
} from "@/features/records/queries";
import type { OnOpenRecord, WorkspaceScreenProps } from "@/features/records/types";
import { ListToolbar, SearchBar, useDebounced } from "@/features/records/ui/layout";
import { PagedList } from "@/features/records/ui/record-list";
import { Chip, Row, Segments } from "@/features/records/ui/rows";
import { ErrorState, LoadingRows, Notice } from "@/features/records/ui/states";
import { firstParam } from "@/lib/navigation";
import type { QueryScope } from "@/queries/keys";
import { router, useLocalSearchParams } from "expo-router";
import {
  Archive,
  Building2,
  Download,
  Handshake,
  Plus,
  Settings2,
  UserRound,
} from "lucide-react-native";

export type CrmScreenProps = WorkspaceScreenProps & {
  /** Whether the CRM app is on. Off shows only the core contact and interaction flows. Defaults to the workspace's setting. */
  crmEnabled?: boolean;
};

const byName =
  <T,>(name: (row: T) => string) =>
  (a: T, b: T) =>
    name(a).localeCompare(name(b));
const crmSections = new Set<CrmSection>(["accounts", "deals", "pipeline", "reports"]);
const createLabels: Record<CrmSection, string> = {
  contacts: "New contact",
  accounts: "New account",
  deals: "New deal",
  pipeline: "New deal",
  interactions: "Log interaction",
  reports: "New deal",
};

export function CrmScreen({ organizationId, onOpenRecord, crmEnabled }: CrmScreenProps) {
  const scope = useRecordScope(organizationId);
  const apps = useWorkspaceApps(scope);
  // Contacts and interactions are core. A failed app lookup hides only the CRM sections.
  const crm = crmEnabled ?? apps.enabled("crm");
  const params = useLocalSearchParams<{ crmSection?: string }>();
  const section = crmSection(firstParam(params.crmSection));
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingStages, setEditingStages] = useState(false);
  const [settings, setSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  if (crmEnabled === undefined && apps.query.isPending)
    return <LoadingRows label="Loading contacts" />;
  const current: CrmSection = !crm && crmSections.has(section) ? "contacts" : section;
  const archivable =
    crm && current !== "pipeline" && current !== "interactions" && current !== "reports";
  return (
    <View className="flex-1 bg-surface" testID="crm-screen">
      <ListToolbar title={crm ? "CRM" : "People"}>
        {current === "contacts" || current === "accounts" || current === "deals" ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setExporting(true)}
            accessibilityLabel={`Export ${current}`}
          >
            <Icon as={Download} className="size-5 text-foreground" />
          </Button>
        ) : null}
        {archivable ? (
          <Button
            variant={archived ? "secondary" : "ghost"}
            size="icon"
            onPress={() => setArchived(!archived)}
            accessibilityLabel={archived ? "Show active records" : "Show archived records"}
            accessibilityState={{ selected: archived }}
          >
            <Icon as={Archive} className="size-5 text-foreground" />
          </Button>
        ) : null}
        {current === "pipeline" ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setEditingStages(true)}
            accessibilityLabel="Edit pipeline stages"
          >
            <Icon as={Settings2} className="size-5 text-foreground" />
          </Button>
        ) : null}
        {crm && current !== "pipeline" ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => setSettings(true)}
            accessibilityLabel="CRM settings"
          >
            <Icon as={Settings2} className="size-5 text-foreground" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onPress={() => setCreating(true)}
          accessibilityLabel={createLabels[current]}
          testID="crm-create"
        >
          <Icon as={Plus} className="size-5 text-foreground" />
        </Button>
      </ListToolbar>
      <Segments
        label="CRM section"
        value={current}
        onChange={(next) => {
          router.setParams({ crmSection: next });
          setArchived(false);
        }}
        options={[
          { value: "contacts", label: "Contacts" },
          ...(crm
            ? ([
                { value: "accounts", label: "Accounts" },
                { value: "deals", label: "Deals" },
                { value: "pipeline", label: "Pipeline" },
                { value: "reports", label: "Reports" },
              ] as const)
            : []),
          { value: "interactions", label: "Interactions" },
        ]}
      />
      {crmEnabled === undefined && apps.query.isError ? (
        <ErrorState
          compact
          error={apps.query.error}
          noun="CRM settings"
          onRetry={() => void apps.query.refetch()}
        />
      ) : null}
      {archived && archivable ? <Notice icon={Archive}>Showing archived records.</Notice> : null}
      <SectionBody
        section={current}
        scope={scope}
        archived={archived && archivable}
        onOpenRecord={onOpenRecord}
        creating={creating}
        onCreateClose={() => setCreating(false)}
        editingStages={editingStages}
        onStagesClose={() => setEditingStages(false)}
      />
      {creating && (current === "deals" || current === "pipeline" || current === "reports") ? (
        <NewDeal
          organizationId={organizationId}
          onOpenRecord={onOpenRecord}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {settings && crm ? (
        <CrmSettingsSheet scope={scope} onClose={() => setSettings(false)} />
      ) : null}
      {exporting && (current === "contacts" || current === "accounts" || current === "deals") ? (
        <ExportRecords
          scope={scope}
          kind={current}
          archived={archived}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </View>
  );
}

function SectionBody({
  section,
  editingStages,
  onStagesClose,
  ...props
}: ListProps & {
  section: CrmSection;
  creating: boolean;
  onCreateClose: () => void;
  editingStages: boolean;
  onStagesClose: () => void;
}) {
  switch (section) {
    case "reports":
      return <CrmReports scope={props.scope} onOpenRecord={props.onOpenRecord} />;
    case "contacts":
      return <ContactList {...props} />;
    case "accounts":
      return <AccountList {...props} />;
    case "deals":
      return <DealList {...props} />;
    case "pipeline":
      return (
        <PipelineBoard
          scope={props.scope}
          onOpenRecord={props.onOpenRecord}
          editingStages={editingStages}
          onStagesClose={onStagesClose}
        />
      );
    case "interactions":
      return (
        <InteractionsScreen
          scope={props.scope}
          onOpenRecord={props.onOpenRecord}
          logging={props.creating}
          onLogClose={props.onCreateClose}
        />
      );
  }
}
function emptyTitle(noun: string, term: string, archived: boolean, fallback: string) {
  if (term) return `No ${noun} match`;
  return archived ? `No archived ${noun}` : fallback;
}

type ListProps = {
  scope: QueryScope;
  archived: boolean;
  onOpenRecord: OnOpenRecord;
};

function ContactList({
  scope,
  archived,
  onOpenRecord,
  creating,
  onCreateClose,
}: ListProps & { creating: boolean; onCreateClose: () => void }) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const query = useInfiniteQuery(
    recordQueries.contacts(scope, term, archived ? "archived" : "active"),
  );
  const write = useCreateContact(scope);
  return (
    <View className="flex-1">
      <SearchBar value={search} onChange={setSearch} placeholder="Search contacts" />
      <PagedList
        query={query}
        noun="contacts"
        items={(pages) => pages.flat().sort(byName((row) => row.contact.displayName))}
        keyOf={(row) => row.contact.entityId}
        empty={{
          icon: UserRound,
          title: emptyTitle("contacts", term, archived, "No contacts yet"),
          description:
            term || archived
              ? undefined
              : "Add the people you work with to log interactions and link deals.",
        }}
        renderItem={(row) => (
          <Row
            title={row.contact.displayName}
            subtitle={
              [row.contact.givenName, row.contact.familyName].filter(Boolean).join(" ") || undefined
            }
            leading={<Icon as={UserRound} className="size-4 text-muted-foreground" />}
            trailing={row.archivedAt ? <Chip label="Archived" tone="outline" /> : undefined}
            onPress={() => onOpenRecord({ kind: "contact", id: row.contact.entityId })}
          />
        )}
      />
      {creating ? (
        <ContactForm
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            onCreateClose();
          }}
          onSubmit={(draft) =>
            write.mutate(draft, {
              onSuccess: (id) => {
                onCreateClose();
                onOpenRecord({ kind: "contact", id });
              },
            })
          }
        />
      ) : null}
    </View>
  );
}

function AccountList({
  scope,
  archived,
  onOpenRecord,
  creating,
  onCreateClose,
}: ListProps & { creating: boolean; onCreateClose: () => void }) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const query = useInfiniteQuery(
    recordQueries.accounts(scope, term, archived ? "archived" : "active"),
  );
  return (
    <View className="flex-1">
      <SearchBar value={search} onChange={setSearch} placeholder="Search accounts" />
      <PagedList
        query={query}
        noun="accounts"
        items={(pages) => pages.flat().sort(byName((row) => row.name))}
        keyOf={(row) => row.entityId}
        empty={{
          icon: Building2,
          title: emptyTitle("accounts", term, archived, "No accounts you can read"),
          description:
            term || archived
              ? undefined
              : "Create an account, or ask its owner to share one with you.",
        }}
        renderItem={(row) => (
          <Row
            title={row.name}
            subtitle={row.domain ?? undefined}
            leading={<Icon as={Building2} className="size-4 text-muted-foreground" />}
            onPress={() => onOpenRecord({ kind: "account", id: row.entityId })}
          />
        )}
      />
      {creating ? (
        <NewAccount scope={scope} onOpenRecord={onOpenRecord} onClose={onCreateClose} />
      ) : null}
    </View>
  );
}

/**
 * The create-account form. It mounts once per opening, so its request key covers retries of this
 * form only; the next account gets a new key.
 */
function NewAccount({
  scope,
  onOpenRecord,
  onClose,
}: {
  scope: QueryScope;
  onOpenRecord: OnOpenRecord;
  onClose: () => void;
}) {
  const write = useCreateAccount(scope);
  const [requestId] = useState(newRequestId);
  return (
    <AccountForm
      pending={write.isPending}
      error={write.error}
      onClose={onClose}
      onSubmit={(draft) =>
        write.mutate(
          { requestId, ...draft },
          {
            onSuccess: (id) => {
              onClose();
              onOpenRecord({ kind: "account", id });
            },
          },
        )
      }
    />
  );
}

function DealList({ scope, archived, onOpenRecord }: ListProps) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const query = useInfiniteQuery(
    recordQueries.deals(scope, term, archived ? "archived" : "active"),
  );
  return (
    <View className="flex-1">
      <SearchBar value={search} onChange={setSearch} placeholder="Search deals" />
      <PagedList
        query={query}
        noun="deals"
        items={(pages) => pages.flat().sort(byName((row) => row.title))}
        keyOf={(row) => row.entityId}
        empty={{
          icon: Handshake,
          title: emptyTitle("deals", term, archived, "No deals you can read"),
        }}
        renderItem={(row) => (
          <Row
            title={row.title}
            subtitle={
              [
                formatMoney(row.amount, row.currency),
                row.expectedCloseDate ? `Close ${formatDate(row.expectedCloseDate)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            leading={<Icon as={Handshake} className="size-4 text-muted-foreground" />}
            trailing={<Chip label={outcomeLabels[row.outcome]} tone={outcomeTones[row.outcome]} />}
            onPress={() => onOpenRecord({ kind: "deal", id: row.entityId })}
          />
        )}
      />
    </View>
  );
}

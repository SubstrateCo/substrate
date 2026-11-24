import { Link } from "@tanstack/react-router";

import { useRef, type ReactNode, type RefObject } from "react";

import type { CrmKind } from "./crm-types";
import {
  useRecordManagement,
  type RecordTool,
  type ResponsibleRecord,
} from "./management/record-management";
import { RecordResponsible } from "./management/record-responsible";
import type { RecordSharingProps } from "./management/record-sharing";
import { CopyLink } from "@/components/context/links/copy-link";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { PageSheetHeader, PageSheetBody, usePageSheet } from "@/components/layout/page-sheet";
import { Property, PropertyList } from "@/components/layout/record-section";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Heading } from "@/components/ui/heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { recordLink } from "@/lib/navigation/record-links";
import { Archive, Ellipsis, Pencil, RotateCcw } from "lucide-react";

export function RecordDetailView({
  organizationId,
  entityId,
  kind,
  name,
  summary,
  archived,
  canEdit,
  level,
  ownerRecord,
  onEdit,
  onArchive,
  children,
  tools: featureTools = [],
  properties,
  notice,
}: {
  organizationId: string;
  entityId: string;
  kind: CrmKind;
  name: string;
  summary?: string | null;
  archived: boolean;
  canEdit: boolean;
  level: RecordSharingProps["level"];
  ownerRecord?: ResponsibleRecord;
  onEdit: () => void;
  onArchive: () => void;
  children: ReactNode;
  /** Feature actions, such as Move deal: items in the More actions menu. */
  tools?: RecordTool[];
  properties?: ReactNode;
  notice?: ReactNode;
}) {
  const sheet = usePageSheet();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const management = useRecordManagement({
    organizationId,
    entityId,
    name,
    noun: { accounts: "account", contacts: "contact", deals: "deal" }[kind],
    level,
    record: ownerRecord,
    // Every member edits contacts, so they have no sharing or owner.
    enabled: kind !== "contacts",
    onRestoreFocus: () => menuTrigger.current?.focus(),
  });
  const tools = [...management.tools, ...featureTools];
  const archive: RecordTool | null = canEdit
    ? {
        label: archived ? "Restore" : "Archive",
        icon: archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />,
        onSelect: onArchive,
      }
    : null;
  const link = recordLink(organizationId, kind, entityId);
  const summaryText = summary && <RecordSummary>{summary}</RecordSummary>;
  const propertyList = properties && (
    <RecordProperties>
      {ownerRecord && (
        <Property label="Owner">
          <RecordResponsible
            organizationId={organizationId}
            actorEntityId={ownerRecord.ownerActorEntityId}
          />
        </Property>
      )}
      {properties}
    </RecordProperties>
  );
  if (sheet)
    return (
      <RecordDetailFrame>
        <PageSheetHeader
          title={sheet.label}
          actions={
            <>
              {canEdit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit"
                      onClick={onEdit}
                      disabled={archived}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}
              <CopyLink link={link} grouped />
              <RecordActionsMenu triggerRef={menuTrigger} tools={tools} archive={archive} />
            </>
          }
        />
        {notice}
        <PageSheetBody>
          <div className="grid min-w-0 gap-6 wrap-anywhere">
            <RecordTitle name={name} archived={archived}>
              {summaryText}
            </RecordTitle>
            {propertyList}
            {children}
          </div>
        </PageSheetBody>
        {management.dialogs}
      </RecordDetailFrame>
    );
  return (
    <RecordDetailFrame>
      {kind !== "contacts" && (
        <BackLink>
          <Link {...recordLink(organizationId, kind)}>Back to {kind}</Link>
        </BackLink>
      )}
      <PageHeader
        title={name}
        description={archived ? <Tag>Archived</Tag> : undefined}
        actions={
          <>
            <CopyLink link={link} grouped />
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} disabled={archived}>
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            )}
            <RecordActionsMenu triggerRef={menuTrigger} tools={tools} archive={archive} />
          </>
        }
      />
      {notice}
      <RecordPageBody summary={summaryText} properties={propertyList}>
        {children}
      </RecordPageBody>
      {management.dialogs}
    </RecordDetailFrame>
  );
}

/** The More actions menu on the sheet and the page: record tools, then Archive or Restore below a separator. */
function RecordActionsMenu({
  triggerRef,
  tools,
  archive,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  tools: RecordTool[];
  archive: RecordTool | null;
}) {
  // A dialog opens after the menu has handed focus back to its trigger, so the dialog returns
  // focus there when it closes instead of to the removed menu item.
  const pending = useRef<(() => void) | null>(null);
  if (!tools.length && !archive) return null;
  const item = (tool: RecordTool) => (
    <DropdownMenuItem
      key={tool.label}
      onSelect={() => {
        pending.current = tool.onSelect;
      }}
    >
      {tool.icon}
      {tool.label}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button ref={triggerRef} variant="ghost" size="icon-sm" aria-label="More actions">
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          const run = pending.current;
          pending.current = null;
          if (!run) return;
          event.preventDefault();
          triggerRef.current?.focus();
          run();
        }}
      >
        {tools.map(item)}
        {archive && tools.length > 0 && <DropdownMenuSeparator />}
        {archive && item(archive)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RecordDetailFrame({ children }: { children: ReactNode }) {
  const sheet = usePageSheet();
  if (sheet)
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col *:data-[slot=page-header]:shrink-0">
        {children}
      </div>
    );
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">{children}</div>
    </div>
  );
}

export function RecordDetailLoading({ kind }: { kind: CrmKind }) {
  const sheet = usePageSheet();
  const properties = (
    <RecordProperties>
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex min-h-8 items-center gap-2">
          <SkeletonText width="4rem" />
          <SkeletonText width="8rem" />
        </div>
      ))}
    </RecordProperties>
  );
  if (sheet)
    return (
      <RecordDetailFrame>
        <PageSheetHeader title={sheet.label} />
        <PageSheetBody>
          <div role="status" aria-label={`Loading ${kind}`}>
            <div aria-hidden="true" className="grid gap-6">
              <RecordTitle name={<SkeletonText width="12rem" />} archived={false}>
                <RecordSummary>
                  <SkeletonText width="20rem" />
                </RecordSummary>
              </RecordTitle>
              {properties}
            </div>
          </div>
        </PageSheetBody>
      </RecordDetailFrame>
    );
  return (
    <RecordDetailFrame>
      <div role="status" aria-label={`Loading ${kind}`}>
        <div aria-hidden="true" className="space-y-6">
          <div className="text-sm">
            <SkeletonText width="7rem" />
          </div>
          <PageHeader title={<SkeletonText width="12rem" />} />
          <RecordPageBody
            summary={
              <RecordSummary>
                <SkeletonText width="20rem" />
              </RecordSummary>
            }
            properties={properties}
          />
        </div>
      </div>
    </RecordDetailFrame>
  );
}

/** The record name in a sheet body, with its Archived tag and summary below. */
function RecordTitle({
  name,
  archived,
  children,
}: {
  name: ReactNode;
  archived: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <Heading level={2} variant="record" className="min-w-0 wrap-anywhere">
          {name}
        </Heading>
        {archived && <Tag className="mt-0.5 shrink-0">Archived</Tag>}
      </div>
      {children}
    </div>
  );
}

function RecordSummary({ children }: { children: ReactNode }) {
  return <p className="text-sm/relaxed wrap-anywhere whitespace-pre-wrap">{children}</p>;
}

function RecordProperties({ children }: { children: ReactNode }) {
  return (
    <aside aria-label="Record details" className="min-w-0">
      <PropertyList>{children}</PropertyList>
    </aside>
  );
}

/** A record page: the summary and sections, with the properties in a right column when wide. */
function RecordPageBody({
  summary,
  children,
  properties,
}: {
  summary?: ReactNode;
  children?: ReactNode;
  properties?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-3">
      <div className="min-w-0 space-y-6 @3xl:col-span-2">
        {summary}
        {children}
      </div>
      {properties}
    </div>
  );
}

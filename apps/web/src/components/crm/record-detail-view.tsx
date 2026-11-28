import type { CrmRecordCapabilities } from "@substrate/contracts/access/capabilities";

import { Link } from "@tanstack/react-router";

import { useRef, type ReactNode, type RefObject } from "react";

import { singularLabels, type CrmKind } from "./crm-types";
import {
  useRecordManagement,
  type RecordTool,
  type ResponsibleRecord,
} from "./management/record-management";
import { RecordResponsible } from "./management/record-responsible";
import { CopyLink } from "@/components/context/links/copy-link";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { MoreActionsTrigger } from "@/components/layout/more-actions-trigger";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { PageSheetHeader, PageSheetBody } from "@/components/layout/page-sheet";
import { usePageSheet } from "@/components/layout/page-sheet-context";
import { Property, PropertyList } from "@/components/layout/record-section";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Heading } from "@/components/ui/heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { recordLink, type RecordLink } from "@/lib/navigation/record-links";
import { Archive, Pencil, RotateCcw } from "lucide-react";

export function RecordDetailView({
  entityId,
  kind,
  name,
  summary,
  archived,
  capabilities,
  ownerRecord,
  onEdit,
  onArchive,
  children,
  tools: featureTools = [],
  properties,
  notice,
}: {
  entityId: string;
  kind: CrmKind;
  name: string;
  summary?: string | null;
  archived: boolean;
  capabilities: CrmRecordCapabilities;
  ownerRecord?: ResponsibleRecord;
  onEdit: () => void;
  onArchive: () => void;
  children: ReactNode;
  tools?: RecordTool[];
  properties?: ReactNode;
  notice?: ReactNode;
}) {
  const { organizationId } = useWorkspaceScope();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const management = useRecordManagement({
    entityId,
    name,
    noun: singularLabels[kind],
    capabilities,
    record: ownerRecord,
    enabled: kind !== "contacts",
    onRestoreFocus: () => menuTrigger.current?.focus(),
  });
  const { canArchive, canEdit } = capabilities;
  const archive: RecordTool | null = canArchive
    ? {
        label: archived ? "Restore" : "Archive",
        icon: archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />,
        onSelect: onArchive,
      }
    : null;
  return (
    <>
      <RecordDetailLayout
        tools={{
          link: recordLink(organizationId, kind, entityId),
          edit: canArchive ? { onEdit, disabled: !canEdit } : undefined,
          menu: (
            <RecordActionsMenu
              triggerRef={menuTrigger}
              tools={[...management.tools, ...featureTools]}
              archive={archive}
            />
          ),
        }}
        back={
          kind !== "contacts" && (
            <BackLink>
              <Link {...recordLink(organizationId, kind)}>Back to {kind}</Link>
            </BackLink>
          )
        }
        name={name}
        archived={archived}
        summary={
          summary && (
            <RecordSummary>
              <MessageMarkdown body={summary} />
            </RecordSummary>
          )
        }
        properties={
          properties && (
            <RecordProperties>
              {ownerRecord && (
                <Property label="Owner">
                  <RecordResponsible actorEntityId={ownerRecord.ownerActorEntityId} />
                </Property>
              )}
              {properties}
            </RecordProperties>
          )
        }
        notice={notice}
      >
        {children}
      </RecordDetailLayout>
      {management.dialogs}
    </>
  );
}

export function RecordDetailLoading({ kind }: { kind: CrmKind }) {
  return (
    <RecordDetailLayout
      loadingLabel={`Loading ${kind}`}
      back={
        <div className="text-sm">
          <SkeletonText width="7rem" />
        </div>
      }
      name={<SkeletonText width="12rem" />}
      archived={false}
      summary={
        <RecordSummary>
          <SkeletonText width="20rem" />
        </RecordSummary>
      }
      properties={
        <RecordProperties>
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex min-h-8 items-center gap-2">
              <SkeletonText width="4rem" />
              <SkeletonText width="8rem" />
            </div>
          ))}
        </RecordProperties>
      }
    />
  );
}

type RecordHeaderTools = {
  link: RecordLink;
  edit?: { onEdit: () => void; disabled: boolean };
  menu: ReactNode;
};

type RecordLayoutProps = {
  tools?: RecordHeaderTools;
  back?: ReactNode;
  name: ReactNode;
  archived: boolean;
  summary?: ReactNode;
  properties?: ReactNode;
  notice?: ReactNode;
  children?: ReactNode;
  loadingLabel?: string;
};

function RecordDetailLayout(props: RecordLayoutProps) {
  const sheet = usePageSheet();
  if (sheet) return <RecordSheetLayout label={sheet.label} {...props} />;
  return <RecordPageLayout {...props} />;
}

function RecordSheetLayout({
  label,
  tools,
  name,
  archived,
  summary,
  properties,
  notice,
  children,
  loadingLabel,
}: RecordLayoutProps & { label: string }) {
  const body = (
    <div className="grid min-w-0 gap-6 wrap-anywhere">
      <RecordTitle name={name} archived={archived}>
        {summary}
      </RecordTitle>
      {properties}
      {children}
    </div>
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col *:data-[slot=page-header]:shrink-0">
      <PageSheetHeader
        title={label}
        actions={
          tools && (
            <>
              {tools.edit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit"
                      onClick={tools.edit.onEdit}
                      disabled={tools.edit.disabled}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}
              <CopyLink link={tools.link} grouped />
              {tools.menu}
            </>
          )
        }
      />
      {notice}
      <PageSheetBody>
        {loadingLabel ? (
          <RecordLoadingStatus label={loadingLabel}>{body}</RecordLoadingStatus>
        ) : (
          body
        )}
      </PageSheetBody>
    </div>
  );
}

function RecordPageLayout({
  tools,
  back,
  name,
  archived,
  summary,
  properties,
  notice,
  children,
  loadingLabel,
}: RecordLayoutProps) {
  const page = (
    <>
      {back}
      <PageHeader
        title={name}
        description={archived ? <Tag>Archived</Tag> : undefined}
        actions={
          tools && (
            <>
              <CopyLink link={tools.link} grouped />
              {tools.edit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={tools.edit.onEdit}
                  disabled={tools.edit.disabled}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              )}
              {tools.menu}
            </>
          )
        }
      />
      {notice}
      <RecordPageBody summary={summary} properties={properties}>
        {children}
      </RecordPageBody>
    </>
  );
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {loadingLabel ? (
          <RecordLoadingStatus label={loadingLabel} className="space-y-6">
            {page}
          </RecordLoadingStatus>
        ) : (
          page
        )}
      </div>
    </div>
  );
}

function RecordLoadingStatus({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    </div>
  );
}

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
  function choose(run: () => void) {
    pending.current = run;
  }
  return (
    <DropdownMenu>
      <MoreActionsTrigger triggerRef={triggerRef} />
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
        {tools.map((tool) => (
          <RecordToolItem key={tool.label} tool={tool} onChoose={choose} />
        ))}
        {archive && tools.length > 0 && <DropdownMenuSeparator />}
        {archive && <RecordToolItem tool={archive} onChoose={choose} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RecordToolItem({
  tool,
  onChoose,
}: {
  tool: RecordTool;
  onChoose: (run: () => void) => void;
}) {
  return (
    <DropdownMenuItem onSelect={() => onChoose(tool.onSelect)}>
      {tool.icon}
      {tool.label}
    </DropdownMenuItem>
  );
}

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
  return <div className="min-w-0 wrap-anywhere">{children}</div>;
}

function RecordProperties({ children }: { children: ReactNode }) {
  return (
    <aside aria-label="Record details" className="min-w-0">
      <PropertyList>{children}</PropertyList>
    </aside>
  );
}

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

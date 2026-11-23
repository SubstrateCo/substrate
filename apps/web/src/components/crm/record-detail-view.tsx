import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import type { CrmKind } from "./crm-types";
import { RecordManagement, type ResponsibleRecord } from "./record-management";
import { RecordResponsible } from "./record-responsible";
import type { RecordSharingProps } from "./record-sharing";
import { CopyLink } from "@/components/context/links/copy-link";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Tag } from "@/components/feedback/tag";
import { PageHeader } from "@/components/layout/page-header";
import { PageSheetHeader, PageSheetBody, usePageSheet } from "@/components/layout/page-sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { recordLink } from "@/lib/navigation/record-links";
import { ArrowLeft, Archive, Pencil, RotateCcw } from "lucide-react";

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
  actions,
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
  actions?: ReactNode;
  properties?: ReactNode;
  notice?: ReactNode;
}) {
  const sheet = usePageSheet();
  const Header = sheet ? PageSheetHeader : PageHeader;
  return (
    <RecordDetailFrame>
      {!sheet && kind !== "contacts" && (
        <Button variant="link" size="sm" asChild>
          <Link {...recordLink(organizationId, kind)}>
            <ArrowLeft aria-hidden />
            Back to {kind}
          </Link>
        </Button>
      )}
      <Header
        title={
          sheet && archived ? (
            <span className="flex items-center gap-2">
              {name}
              <Tag>Archived</Tag>
            </span>
          ) : (
            name
          )
        }
        description={archived ? <Tag>Archived</Tag> : undefined}
        actions={
          <>
            <CopyLink link={recordLink(organizationId, kind, entityId)} grouped />
            {/* Every member edits contacts, so they have no sharing or owner. */}
            {kind !== "contacts" && (
              <RecordManagement
                key={entityId}
                organizationId={organizationId}
                entityId={entityId}
                name={name}
                level={level}
                record={ownerRecord}
              />
            )}
            {actions}
            {canEdit && (
              <>
                <RecordAction
                  iconOnly={!!sheet}
                  label="Edit"
                  icon={<Pencil aria-hidden />}
                  onClick={onEdit}
                  disabled={archived}
                />
                <RecordAction
                  iconOnly={!!sheet}
                  label={archived ? "Restore" : "Archive"}
                  icon={archived ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}
                  onClick={onArchive}
                />
              </>
            )}
          </>
        }
      />
      {notice}
      <RecordDetailBody
        summary={summary && <RecordSummary kind={kind}>{summary}</RecordSummary>}
        properties={
          properties && (
            <>
              {ownerRecord && (
                <DetailProperty label="Responsible owner">
                  <RecordResponsible
                    organizationId={organizationId}
                    actorEntityId={ownerRecord.ownerActorEntityId}
                  />
                </DetailProperty>
              )}
              {properties}
            </>
          )
        }
      >
        {children}
      </RecordDetailBody>
    </RecordDetailFrame>
  );
}

/** A ghost icon tool with a tooltip in a sheet; a labelled outline button on the page. */
function RecordAction({
  iconOnly,
  label,
  icon,
  onClick,
  disabled,
}: {
  iconOnly: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (!iconOnly)
    return (
      <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
        {icon}
        {label}
      </Button>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RecordDetailFrame({ children }: { children: ReactNode }) {
  const sheet = usePageSheet();
  if (sheet)
    return (
      <div className="flex min-h-0 flex-1 flex-col *:data-[slot=page-header]:shrink-0">
        {children}
      </div>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-6">{children}</div>
    </div>
  );
}

export function RecordDetailLoading({ kind }: { kind: CrmKind }) {
  const sheet = usePageSheet();
  if (sheet)
    return (
      <RecordDetailFrame>
        <PageSheetHeader title={`Loading ${sheet.label.toLowerCase()}…`} />
        <PageSheetBody>
          <div role="status" aria-label={`Loading ${kind}`} className="space-y-6">
            <SkeletonText width="12rem" />
            <SkeletonText width="20rem" />
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
          <RecordDetailBody
            summary={
              <RecordSummary kind={kind}>
                <SkeletonText width="20rem" />
              </RecordSummary>
            }
            properties={
              kind !== "contacts" && (
                <DetailProperty label="Responsible owner">
                  <SkeletonText width="8rem" />
                </DetailProperty>
              )
            }
          />
        </div>
      </div>
    </RecordDetailFrame>
  );
}

function RecordSummary({ kind, children }: { kind: CrmKind; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium text-muted-foreground">
        {kind === "contacts" ? "Notes" : "Summary"}
      </h2>
      <p className="text-sm wrap-break-word whitespace-pre-wrap">{children}</p>
    </section>
  );
}

function RecordDetailBody({
  summary,
  children,
  properties,
}: {
  summary?: ReactNode;
  children?: ReactNode;
  properties?: ReactNode;
}) {
  const sheet = usePageSheet();
  const content = (
    <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-3">
      <div className="min-w-0 space-y-6 @3xl:col-span-2">
        {summary}
        {children}
      </div>
      {properties && (
        <aside aria-label="Record details" className="space-y-4 rounded-lg border p-5">
          {properties}
        </aside>
      )}
    </div>
  );
  if (sheet) return <PageSheetBody>{content}</PageSheetBody>;
  return content;
}

export function DetailProperty({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm wrap-break-word">{children}</div>
    </div>
  );
}

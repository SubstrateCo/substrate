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
import { Button } from "@/components/ui/button";
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
  return (
    <RecordDetailFrame>
      {kind !== "contacts" && (
        <Button variant="link" size="sm" asChild>
          <Link {...recordLink(organizationId, kind)}>
            <ArrowLeft aria-hidden />
            Back to {kind}
          </Link>
        </Button>
      )}
      <PageHeader
        title={name}
        description={archived ? <Tag>Archived</Tag> : undefined}
        actions={
          <>
            <CopyLink link={recordLink(organizationId, kind, entityId)} grouped />
            <RecordManagement
              key={entityId}
              organizationId={organizationId}
              entityId={entityId}
              name={name}
              level={level}
              record={ownerRecord}
            />
            {actions}
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit} disabled={archived}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={onArchive}>
                  {archived ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}
                  {archived ? "Restore" : "Archive"}
                </Button>
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

function RecordDetailFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">{children}</div>
    </div>
  );
}

export function RecordDetailLoading({ kind }: { kind: CrmKind }) {
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
  return (
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
}

export function DetailProperty({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm wrap-break-word">{children}</div>
    </div>
  );
}

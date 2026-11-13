import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import type { CrmKind } from "./crm-types";
import { RecordManagement, type ResponsibleRecord } from "./record-management";
import { RecordResponsible } from "./record-responsible";
import type { RecordSharingProps } from "./record-sharing";
import { CopyLink } from "@/components/context/links/copy-link";
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
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <Button variant="link" size="sm" asChild>
          <Link {...recordLink(organizationId, kind)}>
            <ArrowLeft aria-hidden />
            Back to {kind}
          </Link>
        </Button>
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
        <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-3">
          <div className="min-w-0 space-y-6 @3xl:col-span-2">
            {summary && (
              <section className="space-y-2">
                <h2 className="text-xs font-medium text-muted-foreground">
                  {kind === "contacts" ? "Notes" : "Summary"}
                </h2>
                <p className="text-sm wrap-break-word whitespace-pre-wrap">{summary}</p>
              </section>
            )}
            {children}
          </div>
          {properties && (
            <aside aria-label="Record details" className="space-y-4 rounded-lg border p-5">
              {ownerRecord && (
                <DetailProperty label="Responsible owner">
                  <RecordResponsible
                    organizationId={organizationId}
                    actorEntityId={ownerRecord.ownerActorEntityId}
                  />
                </DetailProperty>
              )}
              {properties}
            </aside>
          )}
        </div>
      </div>
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

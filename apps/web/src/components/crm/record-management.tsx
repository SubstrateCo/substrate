import { useRef, useState } from "react";

import { RecordOwner, type RecordOwnerProps } from "./record-owner";
import { RecordSharing, type RecordSharingProps } from "./record-sharing";
import { Button } from "@/components/ui/button";
import { UserPlus, UserRound } from "lucide-react";

export type ResponsibleRecord = RecordOwnerProps["record"];

export function RecordManagement({
  organizationId,
  entityId,
  name,
  level,
  record,
}: {
  organizationId: string;
  entityId: string;
  name: string;
  level: RecordSharingProps["level"];
  record?: ResponsibleRecord;
}) {
  const [dialog, setDialog] = useState<"share" | "owner" | null>(null);
  const shareButton = useRef<HTMLButtonElement>(null);
  const ownerButton = useRef<HTMLButtonElement>(null);
  const canEdit = level === "edit" || level === "owner";
  return (
    <>
      {level === "owner" && (
        <Button ref={shareButton} variant="outline" size="sm" onClick={() => setDialog("share")}>
          <UserPlus aria-hidden="true" />
          Share
        </Button>
      )}
      {canEdit && record && (
        <Button ref={ownerButton} variant="outline" size="sm" onClick={() => setDialog("owner")}>
          <UserRound aria-hidden="true" />
          Change owner
        </Button>
      )}
      {dialog === "share" && level === "owner" && (
        <RecordSharing
          organizationId={organizationId}
          entityId={entityId}
          name={name}
          level={level}
          onClose={() => setDialog(null)}
          onRestoreFocus={() => shareButton.current?.focus()}
        />
      )}
      {dialog === "owner" && canEdit && record && (
        <RecordOwner
          organizationId={organizationId}
          entityId={entityId}
          name={name}
          level={level}
          record={record}
          onClose={() => setDialog(null)}
          onRestoreFocus={() => ownerButton.current?.focus()}
        />
      )}
    </>
  );
}

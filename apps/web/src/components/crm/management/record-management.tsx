import { useState, type ReactNode } from "react";

import { RecordOwner, type RecordOwnerProps } from "./record-owner";
import { RecordSharing, type RecordSharingProps } from "./record-sharing";
import { UserPlus, UserRound } from "lucide-react";

export type ResponsibleRecord = RecordOwnerProps["record"];

/** A record header action: an item in the More actions menu. */
export type RecordTool = { label: string; icon: ReactNode; onSelect: () => void };

/** The Share and Change owner tools of an account or deal, and the dialogs they open. */
export function useRecordManagement({
  entityId,
  name,
  noun,
  level,
  record,
  enabled,
  onRestoreFocus,
}: {
  entityId: string;
  name: string;
  /** The record kind in copy, such as "deal". */
  noun: string;
  level: RecordSharingProps["level"];
  record?: ResponsibleRecord;
  enabled: boolean;
  /** Focuses the menu trigger after a tool's dialog closes. */
  onRestoreFocus: () => void;
}) {
  const [dialog, setDialog] = useState<"share" | "owner" | null>(null);
  const canShare = enabled && level === "owner";
  const canReassign = enabled && (level === "edit" || level === "owner") && !!record;
  const tools: RecordTool[] = [];
  if (canShare)
    tools.push({
      label: "Share",
      icon: <UserPlus aria-hidden="true" />,
      onSelect: () => setDialog("share"),
    });
  if (canReassign)
    tools.push({
      label: "Change owner",
      icon: <UserRound aria-hidden="true" />,
      onSelect: () => setDialog("owner"),
    });
  const dialogs = (
    <>
      {dialog === "share" && canShare && (
        <RecordSharing
          entityId={entityId}
          name={name}
          noun={noun}
          level={level}
          onClose={() => setDialog(null)}
          onRestoreFocus={onRestoreFocus}
        />
      )}
      {dialog === "owner" && canReassign && (
        <RecordOwner
          entityId={entityId}
          name={name}
          level={level}
          record={record}
          onClose={() => setDialog(null)}
          onRestoreFocus={onRestoreFocus}
        />
      )}
    </>
  );
  return { tools, dialogs };
}

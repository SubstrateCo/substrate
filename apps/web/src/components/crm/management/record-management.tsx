import type { CrmRecordCapabilities } from "@substrate/contracts/access/capabilities";

import { useState, type ReactNode } from "react";

import { RecordOwner, type RecordOwnerProps } from "./record-owner";
import { RecordSharing } from "./record-sharing";
import { UserPlus, UserRound } from "lucide-react";

export type ResponsibleRecord = RecordOwnerProps["record"];

export type RecordTool = { label: string; icon: ReactNode; onSelect: () => void };

export function useRecordManagement({
  entityId,
  name,
  noun,
  capabilities,
  record,
  enabled,
  onRestoreFocus,
}: {
  entityId: string;
  name: string;
  noun: string;
  capabilities: CrmRecordCapabilities;
  record?: ResponsibleRecord;
  enabled: boolean;
  onRestoreFocus: () => void;
}) {
  const [dialog, setDialog] = useState<"share" | "owner" | null>(null);
  const canShare = enabled && capabilities.canManageAccess;
  const canReassign = enabled && capabilities.canReassign && !!record;
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
          onClose={() => setDialog(null)}
          onRestoreFocus={onRestoreFocus}
        />
      )}
      {dialog === "owner" && canReassign && (
        <RecordOwner
          entityId={entityId}
          name={name}
          record={record}
          onClose={() => setDialog(null)}
          onRestoreFocus={onRestoreFocus}
        />
      )}
    </>
  );
  return { tools, dialogs };
}

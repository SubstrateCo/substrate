import { useRef, useState } from "react";

import { RecordOwner, type RecordOwnerProps } from "./record-owner";
import { RecordSharing, type RecordSharingProps } from "./record-sharing";
import { usePageSheet } from "@/components/layout/page-sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  const sheet = usePageSheet();
  const [dialog, setDialog] = useState<"share" | "owner" | null>(null);
  const shareButton = useRef<HTMLButtonElement>(null);
  const ownerButton = useRef<HTMLButtonElement>(null);
  const canEdit = level === "edit" || level === "owner";
  return (
    <>
      {level === "owner" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={shareButton}
              variant={sheet ? "ghost" : "outline"}
              size={sheet ? "icon-sm" : "sm"}
              aria-label="Share"
              onClick={() => setDialog("share")}
            >
              <UserPlus aria-hidden="true" />
              {!sheet && "Share"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share</TooltipContent>
        </Tooltip>
      )}
      {canEdit && record && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={ownerButton}
              variant={sheet ? "ghost" : "outline"}
              size={sheet ? "icon-sm" : "sm"}
              aria-label="Change owner"
              onClick={() => setDialog("owner")}
            >
              <UserRound aria-hidden="true" />
              {!sheet && "Change owner"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Change owner</TooltipContent>
        </Tooltip>
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

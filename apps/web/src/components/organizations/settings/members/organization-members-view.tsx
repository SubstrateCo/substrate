import { useState, type ReactNode } from "react";

import { MemberRow, type MemberRowData } from "./member-row";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsPanel } from "@/components/layout/settings-page";
import {
  organizationRoles,
  roleLabel,
  type OrganizationRole,
} from "@/lib/organizations/member-policy";
import { Users } from "lucide-react";

type PendingChange =
  | { kind: "role"; member: MemberRowData; role: OrganizationRole }
  | { kind: "remove"; member: MemberRowData };

export function OrganizationMembers({
  organizationName,
  members,
  loading,
  error,
  onRetry,
  inviteAction,
  changing,
  changeError,
  onChangeRole,
  onRemove,
  onResetChange,
}: {
  organizationName?: string;
  members?: MemberRowData[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  /** A link to invitations, for owners. */
  inviteAction?: ReactNode;
  changing: boolean;
  changeError?: Error | null;
  onChangeRole: (memberId: string, role: OrganizationRole, onDone: () => void) => void;
  onRemove: (memberId: string, onDone: () => void) => void;
  onResetChange: () => void;
}) {
  const [pending, setPending] = useState<PendingChange>();
  const close = () => {
    setPending(undefined);
    onResetChange();
  };
  const count = members?.length;
  let description = "People in this organization and what they can do.";
  if (count !== undefined)
    description = `${count} ${count === 1 ? "person" : "people"} in ${organizationName || "this organization"}.`;
  return (
    <SettingsPanel title="Members" description={description} actions={inviteAction}>
      {loading && !members && <LoadingState label="Loading members." rows={3} />}
      {error && !members && <ErrorState title="Couldn't load members" onRetry={onRetry} />}
      {members?.length === 0 && (
        <div className="rounded-xl border">
          <ContentNotice
            icon={Users}
            title="No members yet"
            description="People appear here after they accept an invitation."
          />
        </div>
      )}
      {!!members?.length && (
        <ul
          aria-label="Members"
          className="@container divide-y overflow-hidden rounded-xl border bg-card"
        >
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              disabled={changing}
              onRoleChange={(role) => setPending({ kind: "role", member, role })}
              onRemove={() => setPending({ kind: "remove", member })}
            />
          ))}
        </ul>
      )}
      {pending?.kind === "role" && (
        <ConfirmDialog
          title={`Make ${pending.member.name} ${pending.role === "admin" ? "an" : "a"} ${roleLabel(pending.role).toLowerCase()}?`}
          description={`${roleLabel(pending.member.role)} now. ${organizationRoles.find((option) => option.value === pending.role)!.description}`}
          confirmLabel="Change role"
          pendingLabel="Changing"
          pending={changing}
          error={changeError}
          errorDescription="We couldn't change this role. Please try again."
          onClose={close}
          onConfirm={() => onChangeRole(pending.member.id, pending.role, close)}
        />
      )}
      {pending?.kind === "remove" && (
        <ConfirmDialog
          destructive
          title={`Remove ${pending.member.name}?`}
          description="They lose access to this organization's conversations, projects, and tasks right away. You can invite them again later."
          confirmLabel="Remove member"
          pendingLabel="Removing"
          pending={changing}
          error={changeError}
          errorDescription="We couldn't remove this member. Please try again."
          onClose={close}
          onConfirm={() => onRemove(pending.member.id, close)}
        />
      )}
    </SettingsPanel>
  );
}

import { useRef, type ReactNode } from "react";

import { MemberRow, type MemberRowData } from "./member-row";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { SettingsPanel } from "@/components/layout/settings-page";
import { roleLabel, type OrganizationRole } from "@/lib/organizations/member-policy";
import type { ResourceStatus } from "@/lib/resource-state";
import { Users } from "lucide-react";

type PendingChange =
  | { kind: "role"; member: MemberRowData; role: OrganizationRole }
  | { kind: "remove"; member: MemberRowData };

const roleCapabilities: Record<OrganizationRole, string> = {
  member: "work in the channels and projects they are added to.",
  admin: "manage settings and conversations, and remove members.",
  owner: "manage invitations, roles, and other owners.",
};

type OrganizationMembersProps = {
  organizationName?: string;
  members?: MemberRowData[];
  state: ResourceStatus;
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
};

export function OrganizationMembers({
  organizationName,
  members,
  state,
  loading,
  error,
  onRetry,
  inviteAction,
  changing,
  changeError,
  onChangeRole,
  onRemove,
  onResetChange,
}: OrganizationMembersProps) {
  const list = useRef<HTMLDivElement>(null);
  const {
    value: confirming,
    open: confirm,
    close: closeConfirm,
    restoreFocus,
  } = useStateDialog<PendingChange>(list);
  const blocked = state === "unavailable";
  const close = () => {
    closeConfirm();
    onResetChange();
  };
  const count = members?.length;
  let description = "People in this organization and what they can do.";
  if (count !== undefined)
    description = `${count} ${count === 1 ? "person" : "people"} in ${organizationName || "this organization"}.`;
  return (
    <SettingsPanel
      title="Members"
      description={description}
      actions={blocked ? undefined : inviteAction}
    >
      <div ref={list} tabIndex={-1}>
        <MemberListStatus
          hasData={members !== undefined}
          loading={loading}
          error={error}
          state={state}
          onRetry={onRetry}
        />
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
                onRoleChange={(role) => confirm({ kind: "role", member, role })}
                onRemove={() => confirm({ kind: "remove", member })}
              />
            ))}
          </ul>
        )}
      </div>
      {!blocked && confirming && (
        <MemberChangeDialog
          change={confirming}
          changing={changing}
          changeError={changeError}
          onClose={close}
          onRestoreFocus={restoreFocus}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      )}
    </SettingsPanel>
  );
}

function MemberListStatus({
  hasData,
  loading,
  error,
  state,
  onRetry,
}: Pick<OrganizationMembersProps, "loading" | "error" | "state" | "onRetry"> & {
  hasData: boolean;
}) {
  const blocked = state === "unavailable";
  return (
    <>
      {loading && !hasData && <LoadingState label="Loading members." rows={3} />}
      {error && (!hasData || blocked) && (
        <ErrorState title="Couldn’t load members" onRetry={blocked ? undefined : onRetry} />
      )}
      {state === "stale" && (
        <StaleNotice onRetry={onRetry}>This list may be out of date.</StaleNotice>
      )}
    </>
  );
}

function MemberChangeDialog({
  change,
  changing,
  changeError,
  onClose,
  onRestoreFocus,
  onChangeRole,
  onRemove,
}: Pick<OrganizationMembersProps, "changing" | "changeError" | "onChangeRole" | "onRemove"> & {
  change: PendingChange;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const { member } = change;
  const common = { pending: changing, error: changeError, onClose, onRestoreFocus };
  if (change.kind === "remove") {
    return (
      <ConfirmDialog
        {...common}
        destructive
        title={`Remove ${member.name}?`}
        description="They lose access to this organization’s conversations, projects, and tasks right away. You can invite them again later."
        confirmLabel="Remove member"
        pendingLabel="Removing"
        errorDescription="We couldn’t remove this member. Please try again."
        onConfirm={() => onRemove(member.id, onClose)}
      />
    );
  }
  const { role } = change;
  const currentRole = roleLabel(member.role).toLowerCase();
  const nextRole = `${role === "admin" ? "an" : "a"} ${roleLabel(role).toLowerCase()}`;
  return (
    <ConfirmDialog
      {...common}
      title={`Make ${member.name} ${nextRole}?`}
      description={`${member.name} is ${currentRole === "admin" ? "an" : "a"} ${currentRole} now. As ${nextRole}, they can ${roleCapabilities[role]}`}
      confirmLabel={`Make ${role}`}
      pendingLabel="Changing"
      errorDescription="We couldn’t change this role. Please try again."
      onConfirm={() => onChangeRole(member.id, role, onClose)}
    />
  );
}

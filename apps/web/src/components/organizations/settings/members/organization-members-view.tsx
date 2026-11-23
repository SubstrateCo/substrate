import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { useMemo, useRef, type ReactNode } from "react";

import { memberColumns, type MemberRowData } from "./member-row";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { RowAction } from "@/components/layout/row-actions";
import { SettingsPanel } from "@/components/layout/settings-page";
import { AppTable } from "@/components/table";
import { roleLabel } from "@/lib/organizations/member-policy";
import type { ResourceStatus } from "@/lib/resource-state";
import { UserMinus, Users } from "lucide-react";

type PendingChange =
  | { kind: "role"; member: MemberRowData; role: OrganizationRole }
  | { kind: "remove"; member: MemberRowData };

const roleCapabilities: Record<OrganizationRole, string> = {
  member: "work in the channels and projects they are added to.",
  admin: "manage settings and conversations, invite people, and remove members.",
  owner: "manage invitations, roles, and other owners.",
};

type OrganizationMembersProps = {
  organizationName?: string;
  members?: MemberRowData[];
  state: ResourceStatus;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  /** A link to invitations, for people who may invite. */
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
  const columns = useMemo(
    () =>
      memberColumns({
        disabled: changing,
        onRoleChange: (member, role) => confirm({ kind: "role", member, role }),
      }),
    [changing, confirm],
  );
  const rowActions = useMemo(
    () => ({
      label: (member: MemberRowData) => `Actions for ${member.name}`,
      render: (member: MemberRowData) =>
        member.canRemove && (
          <RowAction
            label={`Remove ${member.name}`}
            destructive
            disabled={changing}
            onClick={() => confirm({ kind: "remove", member })}
          >
            <UserMinus aria-hidden="true" />
          </RowAction>
        ),
    }),
    [changing, confirm],
  );
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
      <div ref={list} tabIndex={-1} className="space-y-3">
        {state === "stale" && (
          <StaleNotice onRetry={onRetry}>This list may be out of date.</StaleNotice>
        )}
        <AppTable
          name="Members"
          columns={columns}
          data={members ?? []}
          getRowId={(member) => member.id}
          loading={loading && !members}
          loadingMessage="Loading members"
          error={!members || blocked ? error : null}
          errorTitle="Couldn’t load members"
          errorDescription="We couldn’t load this content. Please try again."
          onRetry={blocked ? undefined : onRetry}
          empty={{
            icon: Users,
            title: "No members yet",
            description: "People appear here after they accept an invitation.",
          }}
          rowActions={rowActions}
        />
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

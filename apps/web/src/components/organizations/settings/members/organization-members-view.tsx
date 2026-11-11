import { useRef, useState, type ReactNode } from "react";

import { MemberRow, type MemberRowData } from "./member-row";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { StaleNotice } from "@/components/feedback/stale-notice";
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
}: {
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
}) {
  const [pending, setPending] = useState<PendingChange>();
  const launcher = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const restoreFocus = () => {
    if (launcher.current?.isConnected && !launcher.current.matches(":disabled"))
      launcher.current.focus();
    else list.current?.focus();
  };
  const blocked = state === "unavailable";
  const visibleMembers = members;
  const close = () => {
    setPending(undefined);
    onResetChange();
  };
  const count = visibleMembers?.length;
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
        {loading && !members && <LoadingState label="Loading members." rows={3} />}
        {error && (!members || blocked) && (
          <ErrorState title="Couldn’t load members" onRetry={blocked ? undefined : onRetry} />
        )}
        {state === "stale" && (
          <StaleNotice onRetry={onRetry}>This list may be out of date.</StaleNotice>
        )}
        {visibleMembers?.length === 0 && (
          <div className="rounded-xl border">
            <ContentNotice
              icon={Users}
              title="No members yet"
              description="People appear here after they accept an invitation."
            />
          </div>
        )}
        {!!visibleMembers?.length && (
          <ul
            aria-label="Members"
            className="@container divide-y overflow-hidden rounded-xl border bg-card"
          >
            {visibleMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                disabled={changing}
                onRoleChange={(role, target) => {
                  launcher.current = target;
                  setPending({ kind: "role", member, role });
                }}
                onRemove={(target) => {
                  launcher.current = target;
                  setPending({ kind: "remove", member });
                }}
              />
            ))}
          </ul>
        )}
      </div>
      {!blocked && pending?.kind === "role" && (
        <ConfirmDialog
          title={`Make ${pending.member.name} ${pending.role === "admin" ? "an" : "a"} ${roleLabel(pending.role).toLowerCase()}?`}
          description={`${pending.member.name} is ${roleLabel(pending.member.role).toLowerCase() === "admin" ? "an" : "a"} ${roleLabel(pending.member.role).toLowerCase()} now. As ${pending.role === "admin" ? "an" : "a"} ${pending.role}, they can ${roleCapabilities[pending.role]}`}
          confirmLabel={`Make ${pending.role}`}
          pendingLabel="Changing"
          pending={changing}
          error={changeError}
          errorDescription="We couldn’t change this role. Please try again."
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={() => onChangeRole(pending.member.id, pending.role, close)}
        />
      )}
      {!blocked && pending?.kind === "remove" && (
        <ConfirmDialog
          destructive
          title={`Remove ${pending.member.name}?`}
          description="They lose access to this organization’s conversations, projects, and tasks right away. You can invite them again later."
          confirmLabel="Remove member"
          pendingLabel="Removing"
          pending={changing}
          error={changeError}
          errorDescription="We couldn’t remove this member. Please try again."
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={() => onRemove(pending.member.id, close)}
        />
      )}
    </SettingsPanel>
  );
}

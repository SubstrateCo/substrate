import type { ProjectCapabilities } from "@substrate/contracts/access/capabilities";
import { atLeast } from "@substrate/contracts/access/levels";
import type { PermissionLevel } from "@substrate/contracts/tasks";
import { grantCandidates, isLastOwner } from "@substrate/contracts/tasks/project-access";

import { useRef, type ReactNode } from "react";

import type { ProjectDetail } from "../../types";
import { ProjectAccessForm } from "./project-access-form";
import { ProjectMemberRow } from "./project-member-row";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormDialog } from "@/components/feedback/form-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { GroupTitle, SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

const grantVerbs: Record<PermissionLevel, string> = {
  view: "view",
  comment: "comment on",
  edit: "edit",
  owner: "edit and manage access to",
};

export type AccessChange = {
  actorEntityId: string;
  name: string;
  level: PermissionLevel;
  previous?: PermissionLevel;
};

export type ErrorSurface = { kind: "dialog"; onSuccess: () => void } | { kind: "toast" };

type SharingDialog =
  | { kind: "add" }
  | { kind: "raise"; actorEntityId: string; name: string; level: PermissionLevel }
  | { kind: "remove"; actorEntityId: string; name: string };

type SharingActions = {
  pending: boolean;
  error?: Error | null;
  onShare: (change: AccessChange, surface: ErrorSurface) => void;
  onRevoke: (actorEntityId: string, name: string, onSuccess: () => void) => void;
  onClearError: () => void;
};

export function ProjectSharing({
  detail,
  capabilities,
  pending = false,
  ...actions
}: Omit<SharingActions, "pending"> & {
  detail: ProjectDetail;
  capabilities: ProjectCapabilities;
  pending?: boolean;
}) {
  if (capabilities.canManageAccess)
    return <ManagedProjectSharing detail={detail} pending={pending} {...actions} />;
  return (
    <ProjectAccessCard>
      {detail.members.map((member) => (
        <ProjectMemberRow
          key={`${member.actorEntityId}:${member.level}`}
          member={member}
          editable={false}
          pending={pending}
        />
      ))}
    </ProjectAccessCard>
  );
}

function ProjectAccessCard({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <SettingsCard label="Project access">
      <GroupTitle
        title="Project access"
        description="These people have direct access, as do their agents. Organization owners and admins and their agents can also access this project."
        actions={actions}
      />
      <ul className="-mx-2.5 divide-y">{children}</ul>
    </SettingsCard>
  );
}

function ManagedProjectSharing({
  detail,
  ...actions
}: SharingActions & {
  detail: ProjectDetail;
}) {
  const { pending, onShare, onClearError } = actions;
  const addButton = useRef<HTMLButtonElement>(null);
  const { value: dialog, open, close, restoreFocus } = useStateDialog<SharingDialog>(addButton);
  const canAdd = grantCandidates(detail).length > 0;
  const openDialog = (next: SharingDialog) => {
    onClearError();
    open(next);
  };
  return (
    <>
      <ProjectAccessCard
        actions={
          canAdd && (
            <Button
              ref={addButton}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => openDialog({ kind: "add" })}
            >
              <UserPlus aria-hidden="true" />
              Add people
            </Button>
          )
        }
      >
        {detail.members.map((member) => {
          const lastOwner = isLastOwner(detail.members, member.actorEntityId);
          if (lastOwner)
            return (
              <ProjectMemberRow
                key={`${member.actorEntityId}:${member.level}`}
                member={member}
                editable={false}
                note="Only owner. Add another owner to change this."
                pending={pending}
              />
            );
          const { actorEntityId, name } = member;
          return (
            <ProjectMemberRow
              key={`${member.actorEntityId}:${member.level}`}
              member={member}
              editable
              pending={pending}
              onChange={(level) => {
                if (!atLeast(member.level, level))
                  openDialog({ kind: "raise", actorEntityId, name, level });
                else
                  onShare(
                    { actorEntityId, name, level, previous: member.level },
                    { kind: "toast" },
                  );
              }}
              onRemove={() => openDialog({ kind: "remove", actorEntityId, name })}
            />
          );
        })}
      </ProjectAccessCard>
      {dialog && (
        <ProjectSharingDialog
          dialog={dialog}
          detail={detail}
          canAdd={canAdd}
          onClose={close}
          onRestoreFocus={restoreFocus}
          {...actions}
        />
      )}
    </>
  );
}

function ProjectSharingDialog({
  dialog,
  detail,
  canAdd,
  onClose,
  onRestoreFocus,
  pending,
  error,
  onShare,
  onRevoke,
  onClearError,
}: SharingActions & {
  dialog: SharingDialog;
  detail: ProjectDetail;
  canAdd: boolean;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const project = detail.project.name;
  const confirm = {
    pending,
    error,
    errorDescription: "Couldn’t change access. Try again.",
    onClose,
    onRestoreFocus,
  };
  if (dialog.kind === "raise")
    return (
      <ConfirmDialog
        {...confirm}
        title={`Give ${dialog.name} more access?`}
        description={`${dialog.name} will be able to ${grantVerbs[dialog.level]} ${project}.`}
        confirmLabel="Change access"
        onConfirm={() => {
          if (pending) return;
          onShare(
            { actorEntityId: dialog.actorEntityId, name: dialog.name, level: dialog.level },
            { kind: "dialog", onSuccess: onClose },
          );
        }}
      >
        <p className="text-sm">This applies to every task, subtask, and comment in this project.</p>
      </ConfirmDialog>
    );
  if (dialog.kind === "remove")
    return (
      <ConfirmDialog
        {...confirm}
        title={`Remove ${dialog.name}’s direct access?`}
        description={`Remove ${dialog.name}’s direct access to ${project}? Organization owners and admins keep access through their role.`}
        confirmLabel="Remove access"
        destructive
        onConfirm={() => {
          if (pending) return;
          onRevoke(dialog.actorEntityId, dialog.name, onClose);
        }}
      >
        <p className="text-sm">
          This removes the direct grant for the project and its tasks, subtasks, and comments.
          Access through an organization owner or admin role remains. Linked messages keep their own
          permissions.
        </p>
      </ConfirmDialog>
    );
  if (!canAdd) return null;
  return (
    <ProjectAccessForm
      detail={detail}
      pending={pending}
      error={error}
      onShare={(actorEntityId, name, level) =>
        onShare({ actorEntityId, name, level }, { kind: "dialog", onSuccess: onClose })
      }
      renderDialog={({ fields, ...editor }) => (
        <FormDialog
          {...editor}
          title={`Share ${project}`}
          description="Give a person in this workspace access."
          saveLabel="Share project"
          onClose={() => {
            onClearError();
            onClose();
          }}
          onRestoreFocus={onRestoreFocus}
        >
          {fields}
        </FormDialog>
      )}
    />
  );
}

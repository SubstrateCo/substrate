import type { PermissionLevel } from "@substrate/contracts/tasks";

import { useRef } from "react";

import type { ProjectDetail } from "../../types";
import { ProjectAccessForm } from "./project-access-form";
import { ProjectMemberRow } from "./project-member-row";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormDialog } from "@/components/feedback/form-dialog";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { GroupTitle, SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import type { ProjectCapabilities } from "@/lib/tasks/project-capabilities";
import { UserPlus } from "lucide-react";

const permissionRank = { view: 0, comment: 1, edit: 2, owner: 3 };
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
  /** The level before the change, so a downgrade can be undone. */
  previous?: PermissionLevel;
};

/**
 * Where a failed change shows. A dialog shows its error and closes on success; a member row or
 * an Undo has no dialog, so its failure shows in a toast.
 */
export type ErrorSurface = { kind: "dialog"; onSuccess: () => void } | { kind: "toast" };

/**
 * Who can open a project. Lowering access applies at once and can be undone. Raising access and
 * removing a person each ask for confirmation first.
 */
export function ProjectSharing({
  detail,
  capabilities,
  pending = false,
  error,
  onShare,
  onRevoke,
  onClearError,
}: {
  detail: ProjectDetail;
  capabilities: ProjectCapabilities;
  pending?: boolean;
  error?: Error | null;
  onShare: (change: AccessChange, surface: ErrorSurface) => void;
  onRevoke: (actorEntityId: string, name: string, onSuccess: () => void) => void;
  onClearError: () => void;
}) {
  const addButton = useRef<HTMLButtonElement>(null);
  const {
    value: dialog,
    open,
    close,
    restoreFocus,
  } = useStateDialog<
    | { kind: "add" }
    | { kind: "review"; actorEntityId: string; name: string; level: PermissionLevel | null }
  >(addButton);
  const review = dialog?.kind === "review" ? dialog : undefined;
  const { canManage } = capabilities;
  const ownerCount = detail.members.filter((member) => member.level === "owner").length;
  const canAdd = detail.actors.some(
    (actor) =>
      actor.type === "human" &&
      !detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const openReview = (actorEntityId: string, name: string, level: PermissionLevel | null) => {
    onClearError();
    open({ kind: "review", actorEntityId, name, level });
  };
  const project = detail.project.name;
  return (
    // oxlint-disable-next-line shadcn/no-restyle -- The member list runs flush to the card's bottom edge (-mx-5 border-t).
    <SettingsCard label="Project access" className="pb-0">
      <GroupTitle
        title="Project access"
        description="These people have direct access, as do their agents. Organization owners and admins and their agents can also access this project."
        actions={
          canManage &&
          canAdd && (
            <Button
              ref={addButton}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                onClearError();
                open({ kind: "add" });
              }}
            >
              <UserPlus aria-hidden="true" />
              Add people
            </Button>
          )
        }
      />
      {dialog?.kind === "add" && canManage && canAdd && (
        <ProjectAccessForm
          detail={detail}
          pending={pending}
          error={error}
          onShare={(actorEntityId, name, level) =>
            onShare({ actorEntityId, name, level }, { kind: "dialog", onSuccess: close })
          }
          renderDialog={({ fields, ...editor }) => (
            <FormDialog
              {...editor}
              title={`Share ${project}`}
              description="Give a person in this workspace access."
              saveLabel="Share project"
              onClose={() => {
                onClearError();
                close();
              }}
              onRestoreFocus={restoreFocus}
            >
              {fields}
            </FormDialog>
          )}
        />
      )}
      <ul className="-mx-5 divide-y border-t">
        {detail.members.map((member) => (
          <ProjectMemberRow
            key={`${member.actorEntityId}:${member.level}`}
            member={member}
            canManage={canManage}
            lastOwner={member.level === "owner" && ownerCount === 1}
            pending={pending}
            onChange={(level) => {
              if (permissionRank[level] > permissionRank[member.level])
                openReview(member.actorEntityId, member.name, level);
              else
                onShare(
                  {
                    actorEntityId: member.actorEntityId,
                    name: member.name,
                    level,
                    previous: member.level,
                  },
                  { kind: "toast" },
                );
            }}
            onRemove={() => openReview(member.actorEntityId, member.name, null)}
          />
        ))}
      </ul>
      {review && canManage && (
        <ConfirmDialog
          title={
            review.level
              ? `Give ${review.name} more access?`
              : `Remove ${review.name}’s direct access?`
          }
          description={
            review.level
              ? `${review.name} will be able to ${grantVerbs[review.level]} ${project}.`
              : `Remove ${review.name}’s direct access to ${project}? Organization owners and admins keep access through their role.`
          }
          confirmLabel={review.level ? "Change access" : "Remove access"}
          destructive={!review.level}
          pending={pending}
          error={error}
          errorDescription="Couldn’t change access. Try again."
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={() => {
            if (pending) return;
            if (review.level)
              onShare(
                { actorEntityId: review.actorEntityId, name: review.name, level: review.level },
                { kind: "dialog", onSuccess: close },
              );
            else onRevoke(review.actorEntityId, review.name, close);
          }}
        >
          <p className="text-sm">
            {review.level
              ? "This applies to every task, subtask, and comment in this project."
              : "This removes the direct grant for the project and its tasks, subtasks, and comments. Access through an organization owner or admin role remains. Linked messages keep their own permissions."}
          </p>
        </ConfirmDialog>
      )}
    </SettingsCard>
  );
}

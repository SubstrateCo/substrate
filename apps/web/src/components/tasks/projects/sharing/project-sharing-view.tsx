import { useRef, useState } from "react";

import type { ProjectDetail, ProjectPermission } from "../../types";
import { ProjectAccessForm } from "./project-access-form";
import { ProjectMemberRow } from "./project-member-row";
import { FormMessage } from "@/components/auth/form-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { GroupTitle, SettingsCard } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";

const permissionRank = { view: 0, comment: 1, edit: 2, owner: 3 };
const grantVerbs: Record<ProjectPermission, string> = {
  view: "view",
  comment: "comment on",
  edit: "edit",
  owner: "edit and manage access to",
};

export type AccessChange = {
  actorEntityId: string;
  name: string;
  level: ProjectPermission;
  /** The level before the change, so a downgrade can be undone. */
  previous?: ProjectPermission;
};

/**
 * Who can open a project. Lowering access applies at once and can be undone. Raising access and
 * removing a person each ask for confirmation first.
 */
export function ProjectSharing({
  detail,
  pending = false,
  error,
  onShare,
  onRevoke,
  onClearError,
}: {
  detail: ProjectDetail;
  pending?: boolean;
  error?: Error | null;
  onShare: (change: AccessChange, onSuccess?: () => void) => void;
  onRevoke: (actorEntityId: string, name: string, onSuccess: () => void) => void;
  onClearError: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [review, setReview] = useState<{
    actorEntityId: string;
    name: string;
    level: ProjectPermission | null;
  } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const reviewOrigin = useRef<HTMLElement | null>(null);
  const canManage = detail.level === "owner";
  const ownerCount = detail.members.filter((member) => member.level === "owner").length;
  const canAdd = detail.actors.some(
    (actor) =>
      actor.type === "human" &&
      !detail.members.some((member) => member.actorEntityId === actor.entityId),
  );
  const openReview = (actorEntityId: string, name: string, level: ProjectPermission | null) => {
    reviewOrigin.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onClearError();
    setReview({ actorEntityId, name, level });
  };
  const project = detail.project.name;
  return (
    <SettingsCard label="Project access" className="pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <GroupTitle
          title="Project access"
          description="Only these people can open this project. Their agents use the same access."
        />
        {canManage && canAdd && (
          <Dialog
            open={adding}
            onOpenChange={(open) => {
              if (pending) return;
              onClearError();
              setAdding(open);
            }}
          >
            <DialogTrigger asChild>
              <Button ref={addButton} variant="outline" size="sm" disabled={pending}>
                <UserPlus aria-hidden="true" />
                Add people
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Share {project}</DialogTitle>
                <DialogDescription>Give a person in this workspace access.</DialogDescription>
              </DialogHeader>
              <ProjectAccessForm
                detail={detail}
                pending={pending}
                error={error}
                onShare={(actorEntityId, name, level) =>
                  onShare({ actorEntityId, name, level }, () => setAdding(false))
                }
                onCancel={() => setAdding(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
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
                onShare({
                  actorEntityId: member.actorEntityId,
                  name: member.name,
                  level,
                  previous: member.level,
                });
            }}
            onRemove={() => openReview(member.actorEntityId, member.name, null)}
          />
        ))}
      </ul>
      {!review && !adding && error && (
        <div className="-mx-5 border-t px-5 py-3">
          <FormMessage error={error} errorDescription="Couldn't change access. Try again." />
        </div>
      )}
      {review && canManage && (
        <ConfirmDialog
          title={
            review.level ? `Give ${review.name} more access?` : `Remove ${review.name}’s access?`
          }
          description={
            review.level
              ? `${review.name} will be able to ${grantVerbs[review.level]} ${project}.`
              : `${review.name} will no longer be able to open ${project}.`
          }
          confirmLabel={review.level ? "Change access" : "Remove access"}
          pendingLabel="Updating access."
          destructive={!review.level}
          pending={pending}
          error={error}
          errorDescription="Couldn't change access. Try again."
          onClose={() => setReview(null)}
          onRestoreFocus={() =>
            (reviewOrigin.current?.isConnected ? reviewOrigin.current : addButton.current)?.focus()
          }
          onConfirm={() => {
            if (pending) return;
            if (review.level)
              onShare(
                { actorEntityId: review.actorEntityId, name: review.name, level: review.level },
                () => setReview(null),
              );
            else onRevoke(review.actorEntityId, review.name, () => setReview(null));
          }}
        >
          <p className="text-sm">
            {review.level
              ? "This applies to every task, subtask, and comment in this project."
              : "They lose access to every task, subtask, and comment in this project. Linked messages keep their own permissions."}
          </p>
        </ConfirmDialog>
      )}
    </SettingsCard>
  );
}

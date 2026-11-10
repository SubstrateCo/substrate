import { useRef, useState } from "react";

import type { ProjectDetail, ProjectPermission } from "../../types";
import { ProjectAccessForm } from "./project-access-form";
import { ProjectMemberRow } from "./project-member-row";
import { FormMessage } from "@/components/auth/form-message";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

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
  onShare: (actorEntityId: string, level: ProjectPermission, onSuccess?: () => void) => void;
  onRevoke: (actorEntityId: string, onSuccess: () => void) => void;
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
  const reviewChange = (actorEntityId: string, name: string, level: ProjectPermission | null) => {
    reviewOrigin.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onClearError();
    setAdding(false);
    setReview({ actorEntityId, name, level });
  };
  return (
    <section
      className="w-full min-w-0 overflow-hidden rounded-lg border bg-card"
      aria-label="Project sharing"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-sm font-semibold">Project access</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Only these people can open this project.
          </p>
        </div>
        {canManage && canAdd && (
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogTrigger asChild>
              <Button ref={addButton} variant="outline" size="sm" disabled={pending}>
                <Plus aria-hidden="true" />
                Add access
              </Button>
            </DialogTrigger>
            <DialogContent
              onCloseAutoFocus={(event) => {
                if (review) event.preventDefault();
              }}
            >
              <DialogTitle>Add project access</DialogTitle>
              <DialogDescription>Choose a person in this workspace.</DialogDescription>
              <ProjectAccessForm
                detail={detail}
                onReview={reviewChange}
                onCancel={() => setAdding(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <ul className="divide-y divide-border">
        {detail.members.map((member) => (
          <ProjectMemberRow
            key={`${member.actorEntityId}:${member.level}`}
            member={member}
            canManage={canManage}
            lastOwner={member.level === "owner" && ownerCount === 1}
            pending={pending}
            onShare={onShare}
            onReview={reviewChange}
          />
        ))}
      </ul>
      {!review && error && (
        <div className="p-4">
          <FormMessage error={error} />
        </div>
      )}
      {review && canManage && (
        <ConfirmDialog
          title="Review access change"
          description={
            review.level
              ? `Give ${review.name} ${review.level} access to ${detail.project.name}?`
              : `Remove ${review.name}'s direct access to ${detail.project.name}?`
          }
          confirmLabel={review.level ? "Confirm access" : "Remove access"}
          pendingLabel="Updating access."
          cancelLabel="Cancel access change"
          pending={pending}
          onClose={() => setReview(null)}
          onRestoreFocus={() =>
            (reviewOrigin.current?.isConnected ? reviewOrigin.current : addButton.current)?.focus()
          }
          onConfirm={() => {
            if (pending) return;
            if (review.level) onShare(review.actorEntityId, review.level, () => setReview(null));
            else onRevoke(review.actorEntityId, () => setReview(null));
          }}
        >
          <p className="text-sm">
            This applies to every task, subtask, and comment in this project. Linked messages keep
            their separate permissions.
          </p>
          {review.level === "owner" && (
            <p className="text-sm text-muted-foreground">Owners can manage project access.</p>
          )}
          <FormMessage error={error} />
        </ConfirmDialog>
      )}
    </section>
  );
}

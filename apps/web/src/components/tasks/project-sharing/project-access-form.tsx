import { useEffect, useId, useRef, useState } from "react";

import { TaskSelect } from "../task-select";
import type { ProjectDetail, ProjectPermission } from "../types";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";

const permissionRank = { view: 0, comment: 1, edit: 2, owner: 3 };

export function ProjectAccessForm({
  detail,
  pending,
  onShare,
}: {
  detail: ProjectDetail;
  pending: boolean;
  onShare: (actorEntityId: string, level: ProjectPermission) => void;
}) {
  const [actorEntityId, setActorEntityId] = useState(detail.actors[0]?.entityId ?? "");
  const [level, setLevel] = useState<ProjectDetail["level"]>("edit");
  const [reviewing, setReviewing] = useState(false);
  const reviewId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const updateButton = useRef<HTMLButtonElement>(null);
  const wasReviewing = useRef(false);
  useEffect(() => {
    if (reviewing) {
      wasReviewing.current = true;
      confirmButton.current?.focus();
    } else if (wasReviewing.current && !pending) {
      updateButton.current?.focus();
      wasReviewing.current = false;
    }
  }, [reviewing, pending]);
  const actor = detail.actors.find((candidate) => candidate.entityId === actorEntityId);
  const member = detail.members.find((candidate) => candidate.actorEntityId === actorEntityId);
  const reducesAccess = member && permissionRank[level] < permissionRank[member.level];
  const permissionLabel = level[0]!.toUpperCase() + level.slice(1);
  if (detail.level !== "owner") return null;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !actor) return;
        const expandsAccess = !member || permissionRank[level] > permissionRank[member.level];
        if (expandsAccess && !reviewing) {
          setReviewing(true);
          return;
        }
        onShare(actorEntityId, level);
        setReviewing(false);
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <TaskSelect
          label="Person or agent"
          disabled={reviewing}
          value={actorEntityId}
          onChange={setActorEntityId}
          options={detail.actors.map((actor) => ({
            value: actor.entityId,
            label: `${actor.name}${actor.type === "agent" ? " (agent)" : ""}`,
          }))}
        />
        <TaskSelect
          label="Permission"
          disabled={reviewing}
          value={level}
          onChange={setLevel}
          options={[
            { value: "view", label: "View" },
            { value: "comment", label: "Comment" },
            { value: "edit", label: "Edit" },
            { value: "owner", label: "Owner" },
          ]}
        />
        {reviewing && actor ? (
          <section aria-label="Access change review" className="space-y-2 border-t pt-3">
            <h3 className="font-semibold">Review project access</h3>
            <p id={`${reviewId}-change`} className="text-sm wrap-break-word">
              Give {actor.name} {permissionLabel} access to {detail.project.name}?
            </p>
            <p id={`${reviewId}-scope`} className="text-sm text-muted-foreground">
              This grants access to every task, subtask, and comment in this project.
            </p>
            {level === "owner" && (
              <p id={`${reviewId}-owner`} className="text-sm text-muted-foreground">
                Owners can manage project access.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <PendingButton
                ref={confirmButton}
                size="sm"
                aria-describedby={`${reviewId}-change ${reviewId}-scope${level === "owner" ? ` ${reviewId}-owner` : ""}`}
                pending={pending}
                pendingLabel="Updating access…"
              >
                Confirm access
              </PendingButton>
              <Button type="button" size="sm" variant="outline" onClick={() => setReviewing(false)}>
                Cancel access change
              </Button>
            </div>
          </section>
        ) : (
          <PendingButton
            ref={updateButton}
            variant={reducesAccess ? "destructive" : "default"}
            disabled={!actor}
            pending={pending}
            pendingLabel="Updating access…"
          >
            Update access
          </PendingButton>
        )}
      </fieldset>
    </form>
  );
}

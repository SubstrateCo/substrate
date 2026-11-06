import { useState } from "react";
import { Button } from "../primitives/button";
import { Spinner } from "../primitives/spinner";
import { FormMessage } from "../auth/form-message";
import type { ProjectDetail, ProjectPermission } from "./types";
import { TaskSelect } from "./task-select";

export function ProjectSharing({
  detail,
  pending = false,
  error,
  onShare,
  onRevoke,
}: {
  detail: ProjectDetail;
  pending?: boolean;
  error?: Error | null;
  onShare: (actorEntityId: string, level: ProjectPermission) => void;
  onRevoke: (actorEntityId: string) => void;
}) {
  const [actorEntityId, setActorEntityId] = useState(detail.actors[0]?.entityId ?? "");
  const [level, setLevel] = useState<ProjectDetail["level"]>("edit");
  return (
    <section className="space-y-4 rounded-xl border p-4" aria-label="Project sharing">
      <h2 className="font-semibold">Project access</h2>
      <p className="text-sm text-muted-foreground">
        Shared access applies to every task, subtask, and comment in this project.
      </p>
      <ul className="space-y-2">
        {detail.members.map((member) => (
          <li
            key={member.actorEntityId}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              {member.name} · {member.level}
            </span>
            {detail.level === "owner" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={`Remove ${member.name}`}
                onClick={() => onRevoke(member.actorEntityId)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {detail.level === "owner" && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) onShare(actorEntityId, level);
          }}
        >
          <TaskSelect
            label="Person or agent"
            value={actorEntityId}
            onChange={setActorEntityId}
            options={detail.actors.map((actor) => ({
              value: actor.entityId,
              label: `${actor.name}${actor.type === "agent" ? " (agent)" : ""}`,
            }))}
          />
          <TaskSelect
            label="Permission"
            value={level}
            onChange={setLevel}
            options={[
              { value: "view", label: "View" },
              { value: "comment", label: "Comment" },
              { value: "edit", label: "Edit" },
              { value: "owner", label: "Owner" },
            ]}
          />
          <Button disabled={pending || !actorEntityId}>
            {pending && <Spinner />}
            {pending ? "Updating access…" : "Update access"}
          </Button>
        </form>
      )}
      <FormMessage error={error} />
    </section>
  );
}

import { useId, useState } from "react";

import { FormMessage } from "../auth/form-message";
import { PendingButton } from "../feedback/pending-button";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { Textarea } from "../primitives/textarea";
import type { Project } from "./types";

export function ProjectForm({
  project,
  onSubmit,
  onCancel,
  pending = false,
  error,
}: {
  project?: Project;
  onSubmit: (draft: { name: string; description: string }) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: Error | null;
}) {
  const id = useId();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const submitLabel = project ? "Save project" : "Create project";
  return (
    <form
      className="mx-auto w-full max-w-xl min-w-0 space-y-5 p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) onSubmit({ name, description });
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <h2 className="text-lg font-semibold">{project ? "Edit project" : "New project"}</h2>
        <p className="text-sm text-muted-foreground">
          Projects start private. Share a project to give others access to all its tasks.
        </p>
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Project name</Label>
          <Input
            id={`${id}-name`}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-description`}>Project description</Label>
          <Textarea
            id={`${id}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={20000}
          />
        </div>
        <FormMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <PendingButton disabled={!name.trim()} pending={pending} pendingLabel="Saving project…">
            {submitLabel}
          </PendingButton>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

import { useState } from "react";

import { TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";

export function ProjectForm({
  project,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  project?: { name: string; description: string };
  pending: boolean;
  error: Error | null;
  onSubmit: (value: { name: string; description: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const dirty = name !== (project?.name ?? "") || description !== (project?.description ?? "");
  return (
    <FormSheet
      title={project ? "Edit project" : "New project"}
      description={
        project
          ? undefined
          : "Only you and workspace admins can read a new project until you share it."
      }
      saveLabel={project ? "Save" : "Create"}
      dirty={dirty}
      pending={pending}
      canSave={name.trim().length > 0}
      error={error}
      onClose={onClose}
      onSave={() => onSubmit({ name: name.trim(), description })}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        maxLength={200}
        autoFocus={!project}
      />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
        multiline
        maxLength={20000}
      />
    </FormSheet>
  );
}

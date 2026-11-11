import { PictureSettings } from "@/components/settings/profile/picture-settings";
import type { Project } from "@/components/tasks/types";
import { usePictureMutations } from "@/queries/files/mutations";

export function ProjectPicture({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const { upload, remove, refresh } = usePictureMutations({
    kind: "project",
    organizationId,
    projectEntityId: project.entityId,
  });
  return (
    <PictureSettings
      state="ready"
      title="Project icon"
      description="Shown beside this project’s name. Anyone who can view the project can see its icon."
      kind="project-icon"
      value={project.image}
      onRetry={() => void refresh()}
      uploading={upload.isPending}
      uploadError={upload.error}
      onUpload={(input, options) => upload.mutate(input, options)}
      removing={remove.isPending}
      onRemove={(options) => remove.mutate(undefined, options)}
    />
  );
}

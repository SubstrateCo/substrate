import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setProjectPicture, uploadProjectPicture } from "@/api/tasks/requests";
import { PictureSettings } from "@/components/settings/profile/picture-settings";
import type { Project } from "@/components/tasks/types";
import type { PictureUploadContext } from "@/components/upload/image-crop-dialog";
import { queryKeys } from "@/queries/keys";

export function ProjectPicture({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.project(organizationId, project.entityId) }),
      client.invalidateQueries({ queryKey: queryKeys.projects(organizationId) }),
    ]);
  const upload = useMutation({
    mutationFn: ({ file, signal, onCommit }: { file: File } & PictureUploadContext) =>
      uploadProjectPicture(organizationId, project.entityId, file, signal, onCommit),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => setProjectPicture(organizationId, project.entityId, null),
    onSettled: refresh,
  });
  return (
    <PictureSettings
      title="Project icon"
      description="Shown beside this project’s name. Anyone who can view the project can see its icon."
      kind="project-icon"
      value={project.image}
      disabled={upload.isPending || remove.isPending}
      onRetry={() => void refresh()}
      onUpload={async (file, context) => {
        await upload.mutateAsync({ file, ...context });
      }}
      onRemove={async () => {
        await remove.mutateAsync();
      }}
    />
  );
}

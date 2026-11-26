import { PictureSettings } from "@/components/settings/profile/picture-settings";
import type { Project } from "@/components/tasks/types";
import { pictureMutationProps } from "@/components/upload/picture-mutation-props";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { usePictureMutations } from "@/queries/files/mutations";

export function ProjectPicture({ project }: { project: Project }) {
  const { organizationId } = useWorkspaceScope();
  const mutations = usePictureMutations({
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
      onRetry={() => void mutations.refresh()}
      {...pictureMutationProps(mutations)}
    />
  );
}

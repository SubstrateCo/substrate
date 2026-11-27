import { ProjectArchive } from "./project-archive";
import { ProjectDelete } from "./project-delete";
import type { Project } from "@/components/tasks/types";

/** An archived project can be deleted; an active one can be archived first. */
export function ProjectDangerZone({ project }: { project: Project }) {
  if (project.archivedAt) return <ProjectDelete project={project} />;
  return <ProjectArchive project={project} />;
}

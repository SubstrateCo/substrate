import { projectExportUrl } from "@/api/exports";
import { DownloadMenu } from "@/components/exports/download-menu";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";

export function ProjectExport({ projectEntityId }: { projectEntityId: string }) {
  const { organizationId } = useWorkspaceScope();
  const url = (format: "csv" | "json") =>
    projectExportUrl({ organizationId, projectEntityId, format });
  return (
    <DownloadMenu
      label="Download project"
      scope="Project details and all tasks"
      urls={{ csv: url("csv"), json: url("json") }}
    />
  );
}

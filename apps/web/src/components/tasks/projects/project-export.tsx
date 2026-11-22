import { projectExportUrl } from "@/api/exports";
import { DownloadMenu } from "@/components/exports/download-menu";

export function ProjectExport({
  organizationId,
  projectEntityId,
}: {
  organizationId: string;
  projectEntityId: string;
}) {
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

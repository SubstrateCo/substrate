import { downloadApi } from "@/api/exports";
import { DownloadMenu } from "@/components/exports/download-menu";

export function ProjectExport({
  organizationId,
  projectEntityId,
}: {
  organizationId: string;
  projectEntityId: string;
}) {
  const api = downloadApi();
  const url = (format: "csv" | "json") =>
    api.tasks.export.$url({ query: { organizationId, projectEntityId, format } }).href;
  return (
    <DownloadMenu
      label="Download project"
      scope="Project details and all tasks"
      urls={{ csv: url("csv"), json: url("json") }}
    />
  );
}

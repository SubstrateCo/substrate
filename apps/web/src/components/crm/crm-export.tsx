import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import type { CrmExport as CrmExportInput } from "@substrate/contracts/crm/export";

import { useQuery } from "@tanstack/react-query";

import { contactsExportUrl, crmExportUrl } from "@/api/exports";
import { DownloadMenu } from "@/components/exports/download-menu";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

export type CrmExportProps = Pick<CrmExportInput, "kind" | "archived" | "search">;

export function CrmExport({ kind, archived, search }: CrmExportProps) {
  const { organizationId } = useWorkspaceScope();
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const allowed =
    !organization.error && organizationSettingsAccess(organization.data?.role).allowed;
  if (!allowed) return null;
  const url = (format: "csv" | "json") =>
    kind === "contacts"
      ? contactsExportUrl({ organizationId, kind, archived, search, format })
      : crmExportUrl({ organizationId, kind, archived, search, format });
  return (
    <DownloadMenu
      label={`Download ${kind}`}
      scope={`All matching ${kind}`}
      urls={{ csv: url("csv"), json: url("json") }}
    />
  );
}

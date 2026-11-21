import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import type { CrmExport as CrmExportInput } from "@substrate/contracts/crm/export";

import { useQuery } from "@tanstack/react-query";

import { downloadApi } from "@/api/exports";
import { DownloadMenu } from "@/components/exports/download-menu";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

export type CrmExportProps = Pick<
  CrmExportInput,
  "organizationId" | "kind" | "archived" | "search"
> & { iconOnly?: boolean };

export function CrmExport({ organizationId, kind, archived, search, iconOnly }: CrmExportProps) {
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const allowed =
    !organization.error && organizationSettingsAccess(organization.data?.role).allowed;
  if (!allowed) return null;
  const api = downloadApi();
  const url = (format: "csv" | "json") =>
    kind === "contacts"
      ? api.contacts.export.$url({ query: { organizationId, kind, archived, search, format } }).href
      : api.crm.export.$url({ query: { organizationId, kind, archived, search, format } }).href;
  return (
    <DownloadMenu
      iconOnly={iconOnly}
      label={`Download ${kind}`}
      scope={`All matching ${kind}`}
      urls={{ csv: url("csv"), json: url("json") }}
    />
  );
}

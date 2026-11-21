import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import type { CrmExport } from "@substrate/contracts/crm/export";

import type { ExportRecord } from "../../shared/export";
import type { WorkspaceScope } from "../../shared/scope";
import { ServiceError, serviceResult } from "../../shared/service-result";

export function exportCrm(scope: WorkspaceScope, input: CrmExport) {
  return serviceResult(async () => {
    if (input.organizationId !== scope.organizationId)
      throw new ServiceError("FORBIDDEN", "Access denied.");
    const organization = await scope.repositories.organizations.summary();
    // There is no CRM export grant. Bulk downloads require existing organization administration.
    if (!organizationSettingsAccess(organization.role).allowed)
      throw new ServiceError(
        "FORBIDDEN",
        "Organization owner or admin access is required to export CRM records.",
      );

    const crm = scope.repositories.crm;
    const headers = {
      accounts: ["entityId", "name", "website", "domain", "archivedAt"],
      contacts: ["entityId", "displayName", "givenName", "familyName", "archivedAt"],
      deals: [
        "entityId",
        "title",
        "accountEntityId",
        "stageId",
        "outcome",
        "amount",
        "currency",
        "expectedCloseDate",
        "archivedAt",
      ],
    };
    return { columns: headers[input.kind], records: records() };

    async function* records(): AsyncGenerator<ExportRecord> {
      let afterEntityId: string | undefined;
      for (;;) {
        const options = {
          limit: 100,
          afterEntityId,
          archived: input.archived,
          search: input.search,
        };
        // These lists enforce organization, entity visibility, and readable relationship IDs.
        let rows: { id: string; cells: (string | Date | null)[] }[];
        if (input.kind === "accounts") {
          rows = (await crm.listAccounts(options)).map((row) => ({
            id: row.entityId,
            cells: [row.entityId, row.name, row.website, row.domain, row.archivedAt],
          }));
        } else if (input.kind === "contacts") {
          rows = (await scope.repositories.contacts.listContacts(options)).map(
            ({ contact, archivedAt }) => ({
              id: contact.entityId,
              cells: [
                contact.entityId,
                contact.displayName,
                contact.givenName,
                contact.familyName,
                archivedAt,
              ],
            }),
          );
        } else {
          rows = (await crm.listDeals(options)).map((row) => ({
            id: row.entityId,
            cells: [
              row.entityId,
              row.title,
              row.accountEntityId,
              row.stageId,
              row.outcome,
              row.amount,
              row.currency,
              row.expectedCloseDate,
              row.archivedAt,
            ],
          }));
        }
        for (const row of rows)
          yield Object.fromEntries(
            headers[input.kind].map((key, index) => [key, row.cells[index]]),
          );
        if (rows.length < options.limit) break;
        afterEntityId = rows.at(-1)!.id;
      }
    }
  });
}

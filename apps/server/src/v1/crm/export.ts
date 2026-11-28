import type { CrmExport } from "@substrate/contracts/crm/export";

import type { ExportRecord } from "../../shared/export-types";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function exportCrm(scope: WorkspaceScope, input: CrmExport) {
  return serviceResult(async () => {
    const crm = scope.repositories.crm;
    await crm.requireExportAccess();
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
    const pageLimit = 100;

    async function fetchPage(
      afterEntityId?: string,
    ): Promise<{ id: string; cells: (string | Date | null)[] }[]> {
      const options = {
        limit: pageLimit,
        afterEntityId,
        archived: input.archived,
        search: input.search,
      };
      if (input.kind === "accounts") {
        return (await crm.listAccounts(options)).map((row) => ({
          id: row.entityId,
          cells: [row.entityId, row.name, row.website, row.domain, row.archivedAt],
        }));
      }
      if (input.kind === "contacts") {
        return (await scope.repositories.contacts.listContacts(options)).map(
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
      }
      return (await crm.listDeals(options)).map((row) => ({
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

    const firstPage = await fetchPage();
    return { columns: headers[input.kind], records: records(firstPage) };

    async function* records(
      initialPage: { id: string; cells: (string | Date | null)[] }[],
    ): AsyncGenerator<ExportRecord> {
      let rows = initialPage;
      for (;;) {
        for (const row of rows)
          yield Object.fromEntries(
            headers[input.kind].map((key, index) => [key, row.cells[index]]),
          );
        if (rows.length < pageLimit) break;
        rows = await fetchPage(rows.at(-1)!.id);
      }
    }
  });
}

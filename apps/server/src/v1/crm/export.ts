import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import { CRM_EXPORT_MAX_ROWS, crmExport, type CrmExport } from "@substrate/contracts/crm/export";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes, WorkspaceScope } from "../../shared/scope";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { Hono } from "hono";
import { z } from "zod";

function cell(value: string | Date | null) {
  let text = value instanceof Date ? value.toISOString() : (value ?? "");
  // Spreadsheet apps can ignore leading whitespace/control characters before a formula.
  if (/^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

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
    const lines = [headers[input.kind].map(cell).join(",")];
    let afterEntityId: string | undefined;
    let count = 0;
    for (;;) {
      const options = { limit: 100, afterEntityId, archived: input.archived, search: input.search };
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
      count += rows.length;
      if (count > CRM_EXPORT_MAX_ROWS)
        throw new ServiceError(
          "PAYLOAD_TOO_LARGE",
          `Export is limited to ${CRM_EXPORT_MAX_ROWS} records. No CSV was generated.`,
        );
      for (const row of rows) lines.push(row.cells.map(cell).join(","));
      if (rows.length < options.limit) break;
      afterEntityId = rows.at(-1)!.id;
    }
    return `${lines.join("\r\n")}\r\n`;
  });
}

export function createCrmExportRoutes(scopes: Scopes) {
  return new Hono<ScopeEnv>().get(
    "/export",
    v("query", crmExport.extend({ kind: z.enum(["accounts", "deals"]) })),
    scopes.workspace("query"),
    async (c) => {
      const input = c.req.valid("query");
      const result = await exportCrm(c.var.scope, input);
      if (!result.success) return respond(c, result);
      return c.body(result.data, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-${input.kind}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
    },
  );
}

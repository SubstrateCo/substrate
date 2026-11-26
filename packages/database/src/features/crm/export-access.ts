import type { RepositoryContext } from "../../core/repository-context";
import { PermissionRequiredError } from "../../errors";

/**
 * There is no CRM export grant. Bulk downloads require organization administration, read on each
 * call. Contacts export uses the same rule and does not need the CRM app.
 */
export function crmExportAccess(context: RepositoryContext) {
  return {
    async requireExportAccess() {
      if (!(await context.isOrganizationAdmin({ human: true })))
        throw new PermissionRequiredError(
          "Organization owner or admin access is required to export CRM records.",
        );
    },
  };
}

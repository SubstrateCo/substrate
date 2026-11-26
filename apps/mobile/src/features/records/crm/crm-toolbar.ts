import type { CrmSection } from "./crm-navigation";

/**
 * The CRM toolbar's actions. Export and stage edits need organization admin access on the
 * server, so members do not see them. Members can read CRM settings; only admins can save them.
 */
export function crmToolbarActions({
  section,
  crm,
  admin,
}: {
  section: CrmSection;
  crm: boolean;
  admin: boolean;
}) {
  return {
    export: admin && (section === "contacts" || section === "accounts" || section === "deals"),
    editStages: admin && section === "pipeline",
    settings: crm && section !== "pipeline",
  };
}
